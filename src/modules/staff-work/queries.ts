import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";
import { and, asc, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { branches, locations } from "@/db/branch-schema";
import { preparationTasks } from "@/db/preparation-schema";
import { productionOrders } from "@/db/production-order-schema";
import { recipeVersions } from "@/db/recipe-schema";
import { items } from "@/db/item-schema";
import { sales, saleOrders } from "@/db/sales-schema";
import { AppError } from "@/lib/errors";
import { requireOperationalContext } from "@/modules/branches/context";
import { centralPreparationLocation } from "@/modules/daily-operations/central-preparation";
import { taskViews } from "@/modules/preparation/queries";
import {
  getPersonalStations,
  getStoreProfile,
  workplaceSchemaReady,
} from "@/modules/workplace/access";
import type { StaffWorkSnapshot } from "./types";
import { integer, six } from "@/modules/inventory/decimal";

export async function getStaffWork(
  db: AppDb,
  actor: Actor,
  now = new Date(),
): Promise<StaffWorkSnapshot> {
  return db.transaction(
    async (tx) => {
      const ctx = await requireOperationalContext(
        tx,
        actor,
        actor.branchId ?? "",
      );
      if (
        actor.accountKind === "store" ||
        ctx.accountKind === "store" ||
        (await getStoreProfile(tx, actor.id))
      )
        throw new AppError(
          "FORBIDDEN",
          "Ingresá con tu cuenta personal para consultar tus tareas.",
          403,
        );
      const [branch] = await tx
        .select({ name: branches.name })
        .from(branches)
        .where(eq(branches.id, ctx.branchId));
      const snapshot: StaffWorkSnapshot = {
        ready: await workplaceSchemaReady(tx),
        branch: { id: ctx.branchId, name: branch.name, timeZone: ctx.timeZone },
        actorId: actor.id,
        serverNow: now.toISOString(),
        assignments: [],
        preparation: { rows: [], hasMore: false },
        production: { rows: [], hasMore: false },
      };
      if (!snapshot.ready) return snapshot;
      const assignments = await getPersonalStations(tx, actor, now);
      snapshot.assignments = assignments.map((a) => ({
        ...a,
        startsAt: a.startsAt.toISOString(),
        endsAt: a.endsAt.toISOString(),
      }));
      const stationIds = [
        ...new Set(
          assignments.flatMap((a) => (a.stationId ? [a.stationId] : [])),
        ),
      ];
      const ids = await tx
        .select({ id: preparationTasks.id })
        .from(preparationTasks)
        .innerJoin(saleOrders, eq(saleOrders.id, preparationTasks.orderId))
        .innerJoin(sales, eq(sales.id, saleOrders.saleId))
        .where(
          and(
            eq(preparationTasks.branchId, ctx.branchId),
            inArray(preparationTasks.status, ["pending", "preparing", "ready"]),
            sql`${sales.status} <> 'cancelled'`,
            or(
              stationIds.length
                ? inArray(preparationTasks.stationId, stationIds)
                : sql`false`,
              and(
                eq(preparationTasks.assigneeId, actor.id),
                isNotNull(preparationTasks.startedAt),
              ),
            ),
          ),
        )
        .orderBy(asc(preparationTasks.enqueuedAt), asc(preparationTasks.id))
        .limit(101);
      const tasks = await taskViews(
        tx,
        ids.slice(0, 100).map((r) => r.id),
      );
      snapshot.preparation = {
        hasMore: ids.length > 100,
        rows: tasks.map((t) => ({
          ...t,
          canStart:
            t.status === "pending" &&
            !!t.stationId &&
            stationIds.includes(t.stationId),
          canReady: t.status === "preparing" && t.assigneeId === actor.id,
          orderReady:
            t.siblings.length > 0 &&
            t.siblings.every((s) =>
              ["ready", "delivered", "cancelled"].includes(s.status),
            ),
        })),
      };
      const depot = await centralPreparationLocation(tx, ctx.branchId);
      if (depot) {
        const orders = await tx
          .select({
            id: productionOrders.id,
            revision: productionOrders.revision,
            state: productionOrders.state,
            name: recipeVersions.outputName,
            baseUnit: recipeVersions.outputUnit,
            plannedQuantity: productionOrders.plannedQuantity,
            scheduledFor: productionOrders.scheduledFor,
            notes: productionOrders.notes,
            locationId: productionOrders.locationId,
            locationName: locations.name,
            preparation: recipeVersions.preparation,
            composition: productionOrders.composition,
          })
          .from(productionOrders)
          .innerJoin(
            recipeVersions,
            eq(recipeVersions.id, productionOrders.recipeVersionId),
          )
          .innerJoin(locations, eq(locations.id, productionOrders.locationId))
          .where(
            and(
              eq(productionOrders.branchId, ctx.branchId),
              eq(productionOrders.locationId, depot.id),
              eq(productionOrders.assignedTo, actor.id),
              inArray(productionOrders.state, ["planned", "confirmed"]),
            ),
          )
          .orderBy(asc(productionOrders.scheduledFor), asc(productionOrders.id))
          .limit(101);
        const page = orders.slice(0, 100);
        const compositions = page.map(
          (o) =>
            (
              o.composition as {
                components: { itemId: string; quantity: string }[];
              }
            ).components,
        );
        const itemIds = [
          ...new Set(
            compositions.flatMap((rows) => rows.map((row) => row.itemId)),
          ),
        ];
        const names = itemIds.length
          ? await tx
              .select({
                id: items.id,
                name: items.name,
                baseUnit: items.baseUnit,
              })
              .from(items)
              .where(inArray(items.id, itemIds))
          : [];
        snapshot.production = {
          hasMore: orders.length > 100,
          rows: page.map((o, index) => {
            const totals = new Map<string, bigint>();
            for (const component of compositions[index])
              totals.set(
                component.itemId,
                (totals.get(component.itemId) ?? 0n) +
                  integer(component.quantity),
              );
            const { composition: _composition, ...safe } = o;
            void _composition;
            return {
              ...safe,
              state: o.state as "planned" | "confirmed",
              scheduledFor: o.scheduledFor?.toISOString() ?? null,
              components: [...totals].map(([itemId, total]) => ({
                itemId,
                name: names.find((n) => n.id === itemId)?.name ?? "Artículo",
                baseUnit:
                  names.find((n) => n.id === itemId)?.baseUnit ?? "unit",
                quantity: six(total),
              })),
            };
          }),
        };
      }
      return snapshot;
    },
    { isolationLevel: "repeatable read" },
  );
}
