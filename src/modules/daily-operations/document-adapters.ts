import { and, eq } from "drizzle-orm";
import type { Tx } from "@/db/types";
import {
  dailyOperationTasks as tasks,
  dailyOperationEvents as events,
} from "@/db/daily-operation-schema";
import { productionOrders } from "@/db/production-order-schema";
import { stockTransfers } from "@/db/transfer-schema";
import { items } from "@/db/item-schema";
import type { OperationalContext } from "../operations/types";
import { classifyUrgency } from "./priority";
import type { TaskState } from "./types";
export async function syncDocumentTask(
  tx: Tx,
  ctx: OperationalContext,
  document: { type: "production" | "transfer"; id: string },
) {
  let data: Partial<typeof tasks.$inferInsert>;
  if (document.type === "production") {
    const [row] = await tx
      .select({
        order: productionOrders,
        name: items.name,
        unit: items.baseUnit,
      })
      .from(productionOrders)
      .innerJoin(items, eq(items.id, productionOrders.outputItemId))
      .where(
        and(
          eq(productionOrders.id, document.id),
          eq(productionOrders.branchId, ctx.branchId),
        ),
      );
    if (!row) return;
    const o = row.order;
    const state: TaskState =
      o.state === "completed"
        ? "done"
        : o.state === "cancelled"
          ? "cancelled"
          : o.state === "planned"
            ? "pending"
            : "in_progress";
    data = {
      title: `Preparar ${row.name}`,
      itemId: o.outputItemId,
      quantity: o.plannedQuantity,
      unit: row.unit,
      locationId: o.locationId,
      assignedTo: o.assignedTo,
      dueAt: o.scheduledFor,
      documentRevision: o.revision,
      state,
    };
  } else {
    const [o] = await tx
      .select()
      .from(stockTransfers)
      .where(
        and(
          eq(stockTransfers.id, document.id),
          eq(stockTransfers.originBranchId, ctx.branchId),
          eq(stockTransfers.destinationBranchId, ctx.branchId),
        ),
      );
    if (!o) return;
    data = {
      title: "Reponer stock",
      originLocationId: o.originLocationId,
      locationId: o.destinationLocationId,
      documentRevision: o.revision,
      state: ["received", "resolved"].includes(o.state)
        ? "done"
        : o.state === "cancelled"
          ? "cancelled"
          : o.state === "confirmed"
            ? "pending"
            : "in_progress",
    };
  }
  const [old] = await tx
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.branchId, ctx.branchId),
        eq(tasks.kind, document.type),
        eq(tasks.documentId, document.id),
        eq(tasks.documentRole, "execute"),
      ),
    )
    .for("update");
  const priority = classifyUrgency({
    now: new Date(),
    dueAt: data.dueAt ?? null,
    blockedCurrentDemand: false,
    coverageDays: null,
    leadDays: null,
    safetyDays: null,
    incomingCoversGap: false,
  });
  // Time can change priority even when no document field changes. Preserve an
  // operator's blocked state unless the underlying document actually advances.
  const sameDocument = old?.documentRevision === data.documentRevision;
  const urgency =
    document.type === "transfer" && old ? old.urgency : priority.urgency;
  if (old && sameDocument && old.urgency === urgency) return;
  if (old && sameDocument) data = { urgency };
  if (old) {
    const [saved] = await tx
      .update(tasks)
      .set({
        ...data,
        urgency,
        revision: old.revision + 1,
        updatedAt: new Date(),
      })
      .where(eq(tasks.id, old.id))
      .returning();
    await tx.insert(events).values({
      branchId: ctx.branchId,
      taskId: saved.id,
      revision: saved.revision,
      action: "document_sync",
      actorId: ctx.actorId,
    });
  } else {
    const [saved] = await tx
      .insert(tasks)
      .values({
        branchId: ctx.branchId,
        kind: document.type,
        documentId: document.id,
        title: data.title!,
        ...data,
        urgency: priority.urgency,
      })
      .onConflictDoNothing()
      .returning();
    if (saved)
      await tx.insert(events).values({
        branchId: ctx.branchId,
        taskId: saved.id,
        revision: saved.revision,
        action: "document_import",
        actorId: ctx.actorId,
      });
  }
}
