import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";
import {
  dailyOperationTasks as tasks,
  dailyOperationEvents as events,
  dailyOperationSettings as settings,
} from "@/db/daily-operation-schema";
import { productionOrders } from "@/db/production-order-schema";
import { stockTransfers, transferAllocations } from "@/db/transfer-schema";
import { recipes } from "@/db/recipe-schema";
import { executeCommand } from "../operations/command";
import { readReplenishmentSnapshot } from "../replenishment/service";
import { syncDocumentTask } from "./document-adapters";
import { buildDailySuggestions } from "./suggestions";
import { integer } from "../inventory/decimal";
export async function reconcileDailyOperations(
  db: AppDb,
  actor: Actor,
  raw: unknown,
) {
  const input = z.object({ requestId: z.uuid() }).strict().parse(raw);
  return executeCommand(
    db,
    actor,
    actor.branchId ?? "",
    input,
    "daily-reconcile",
    input,
    async (tx, ctx) => {
      await tx
        .insert(settings)
        .values({ branchId: ctx.branchId })
        .onConflictDoNothing();
      await tx
        .select()
        .from(settings)
        .where(eq(settings.branchId, ctx.branchId))
        .for("update");
      const orders = await tx
        .select()
        .from(productionOrders)
        .where(eq(productionOrders.branchId, ctx.branchId));
      const transfers = await tx
        .select()
        .from(stockTransfers)
        .where(
          and(
            eq(stockTransfers.originBranchId, ctx.branchId),
            eq(stockTransfers.destinationBranchId, ctx.branchId),
          ),
        );
      for (const o of orders)
        await syncDocumentTask(tx, ctx, { type: "production", id: o.id });
      for (const t of transfers)
        await syncDocumentTask(tx, ctx, { type: "transfer", id: t.id });
      const snapshot = await readReplenishmentSnapshot(tx, ctx, new Date());
      const prep = await tx
        .select({ id: recipes.outputItemId })
        .from(recipes)
        .where(
          and(eq(recipes.kind, "preparation"), isNotNull(recipes.outputItemId)),
        );
      const committed = new Map<string, bigint>();
      const add = (key: string, q: string) =>
        committed.set(key, (committed.get(key) ?? 0n) + integer(q));
      for (const o of orders)
        if (["planned", "confirmed"].includes(o.state))
          add(`${o.outputItemId}:${o.locationId}`, o.plannedQuantity);
      const pending = transfers.filter((t) => t.state === "confirmed");
      if (pending.length) {
        const allocations = await tx
          .select()
          .from(transferAllocations)
          .where(
            inArray(
              transferAllocations.transferId,
              pending.map((t) => t.id),
            ),
          );
        for (const a of allocations) {
          const t = pending.find((t) => t.id === a.transferId)!;
          add(`${a.itemId}:${t.destinationLocationId}`, a.quantity);
        }
      }
      const suggested = buildDailySuggestions(
        snapshot,
        new Set(prep.flatMap((p) => (p.id ? [p.id] : []))),
        committed,
      );
      const existing = await tx
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.branchId, ctx.branchId),
            isNotNull(tasks.needKey),
            sql`${tasks.state} not in ('done','cancelled','superseded')`,
          ),
        )
        .for("update");
      let created = 0,
        updated = 0,
        superseded = 0;
      for (const suggestion of suggested) {
        const old = existing.find((t) => t.needKey === suggestion.needKey);
        if (old) {
          if (
            old.documentId ||
            old.state === "in_progress" ||
            old.state === "awaiting_review"
          )
            continue;
          if (
            old.quantity === suggestion.quantity &&
            old.reason === suggestion.reason &&
            old.urgency === suggestion.urgency
          )
            continue;
          const [saved] = await tx
            .update(tasks)
            .set({
              quantity: suggestion.quantity,
              urgency: suggestion.urgency,
              ...(old.state === "blocked" ? {} : { reason: suggestion.reason }),
              revision: old.revision + 1,
              updatedAt: new Date(),
            })
            .where(eq(tasks.id, old.id))
            .returning();
          await tx.insert(events).values({
            branchId: ctx.branchId,
            taskId: saved.id,
            revision: saved.revision,
            action: "suggestion_update",
            actorId: ctx.actorId,
          });
          updated++;
        } else {
          const [saved] = await tx
            .insert(tasks)
            .values({ ...suggestion, branchId: ctx.branchId })
            .onConflictDoNothing()
            .returning();
          if (saved) {
            await tx.insert(events).values({
              branchId: ctx.branchId,
              taskId: saved.id,
              revision: 1,
              action: "suggestion_create",
              actorId: ctx.actorId,
            });
            created++;
          }
        }
      }
      for (const old of existing) {
        if (
          old.documentId ||
          ["in_progress", "awaiting_review"].includes(old.state) ||
          suggested.some((s) => s.needKey === old.needKey)
        )
          continue;
        await tx
          .update(tasks)
          .set({
            state: "superseded",
            reason:
              "La necesidad cambió o está cubierta por documentos existentes.",
            revision: old.revision + 1,
            updatedAt: new Date(),
          })
          .where(eq(tasks.id, old.id));
        await tx.insert(events).values({
          branchId: ctx.branchId,
          taskId: old.id,
          revision: old.revision + 1,
          action: "superseded",
          actorId: ctx.actorId,
        });
        superseded++;
      }
      return { created, updated, superseded };
    },
    { isolationLevel: "repeatable read" },
  );
}
