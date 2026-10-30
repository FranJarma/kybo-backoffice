import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import type { Actor } from "@/lib/access";
import { requireCatalogAccess } from "@/lib/access";
import { productionOrders } from "@/db/production-order-schema";
import { recipeVersions } from "@/db/recipe-schema";
import { locations, branchMemberships } from "@/db/branch-schema";
import { user, operationalUsers } from "@/db/auth-schema";
import { items } from "@/db/item-schema";
import { auditEvents } from "@/db/business-schema";
import { stockMovements } from "@/db/stock-movement-schema";
import { stockDocuments } from "@/db/inventory-document-schema";
import { inventoryLots } from "@/db/inventory-schema";
import { integer, six } from "../inventory/decimal";
import { latestProductionResult } from "./result";
import { AppError } from "@/lib/errors";
import { getStoreProfile, workplaceSchemaReady } from "../workplace/access";
import { centralPreparationLocation } from "../daily-operations/central-preparation";

async function personalAccount(db: AppDb, actor: Actor) {
  if (actor.accountKind === "store" || (await getStoreProfile(db, actor.id)))
    throw new AppError(
      "FORBIDDEN",
      "La producción requiere una cuenta personal.",
      403,
    );
}

export async function productionAssignees(db: AppDb, actor: Actor) {
  await personalAccount(db, actor);
  requireCatalogAccess(actor);
  return db
    .selectDistinct({ id: user.id, name: user.name })
    .from(user)
    .innerJoin(operationalUsers, eq(operationalUsers.userId, user.id))
    .leftJoin(
      branchMemberships,
      and(
        eq(branchMemberships.userId, user.id),
        eq(branchMemberships.branchId, actor.branchId!),
        isNull(branchMemberships.revokedAt),
      ),
    )
    .where(
      and(
        eq(operationalUsers.disabled, false),
        or(
          eq(branchMemberships.branchId, actor.branchId!),
          and(eq(user.id, actor.id), eq(operationalUsers.role, "admin")),
        ),
      ),
    )
    .orderBy(user.name, user.id);
}

export async function listProductionOrders(
  db: AppDb,
  actor: Actor,
  scope: string,
  offset: number,
  mine: boolean,
) {
  await personalAccount(db, actor);
  const personalDepot =
    actor.role === "staff" && (await workplaceSchemaReady(db));
  const depot = personalDepot
    ? await centralPreparationLocation(db as unknown as Tx, actor.branchId!)
    : null;
  const page = await db
    .select({
      order: productionOrders,
      name: recipeVersions.outputName,
      baseUnit: recipeVersions.outputUnit,
      preparation: recipeVersions.preparation,
      location: locations.name,
      assignee: user.name,
    })
    .from(productionOrders)
    .innerJoin(
      recipeVersions,
      eq(recipeVersions.id, productionOrders.recipeVersionId),
    )
    .innerJoin(locations, eq(locations.id, productionOrders.locationId))
    .leftJoin(user, eq(user.id, productionOrders.assignedTo))
    .where(
      and(
        eq(productionOrders.branchId, actor.branchId!),
        personalDepot
          ? depot
            ? eq(productionOrders.locationId, depot.id)
            : sql`false`
          : undefined,
        inArray(
          productionOrders.state,
          scope === "history"
            ? ["completed", "cancelled"]
            : ["planned", "confirmed"],
        ),
        actor.role === "staff" || mine
          ? eq(productionOrders.assignedTo, actor.id)
          : undefined,
      ),
    )
    .orderBy(
      scope === "history"
        ? desc(productionOrders.completedAt)
        : asc(productionOrders.scheduledFor),
      productionOrders.id,
    )
    .limit(101)
    .offset(offset);
  const rows = page.slice(0, 100);
  const compositions = rows.map(
    (r) =>
      r.order.composition as {
        components: { itemId: string; quantity: string }[];
        untracked?: { itemId: string }[];
      },
  );
  const itemIds = [
    ...new Set(compositions.flatMap((c) => c.components.map((i) => i.itemId))),
  ];
  const componentItems = itemIds.length
    ? await db
        .select({ id: items.id, name: items.name, baseUnit: items.baseUnit })
        .from(items)
        .where(inArray(items.id, itemIds))
    : [];
  const events = rows.length
    ? await db
        .select({
          recordId: auditEvents.recordId,
          action: auditEvents.action,
          at: auditEvents.createdAt,
          actor: user.name,
          after: auditEvents.after,
          before: auditEvents.before,
        })
        .from(auditEvents)
        .innerJoin(user, eq(user.id, auditEvents.actorId))
        .where(
          and(
            eq(auditEvents.entity, "production-orders"),
            inArray(
              auditEvents.recordId,
              rows.map((r) => r.order.id),
            ),
          ),
        )
        .orderBy(auditEvents.createdAt, auditEvents.id)
    : [];
  const assignments = [
    ...new Set(
      events.flatMap((e) => {
        const id = (e.after as Record<string, unknown>).assignedTo;
        return typeof id === "string" ? [id] : [];
      }),
    ),
  ];
  const people = assignments.length
    ? await db
        .select({ id: user.id, name: user.name })
        .from(user)
        .where(inArray(user.id, assignments))
    : [];
  const movements = rows.length
    ? await db
        .select({
          orderId: stockDocuments.productionOrderId,
          itemId: stockMovements.itemId,
          name: items.name,
          baseUnit: items.baseUnit,
          quantity: stockMovements.quantity,
          lotId: inventoryLots.id,
          lotCode: inventoryLots.lotCode,
          expiresOn: inventoryLots.expiresOn,
        })
        .from(stockMovements)
        .innerJoin(
          stockDocuments,
          eq(stockDocuments.id, stockMovements.documentId),
        )
        .innerJoin(inventoryLots, eq(inventoryLots.id, stockMovements.lotId))
        .innerJoin(items, eq(items.id, stockMovements.itemId))
        .where(
          and(
            eq(stockMovements.branchId, actor.branchId!),
            inArray(
              stockDocuments.productionOrderId,
              rows.map((r) => r.order.id),
            ),
          ),
        )
        .orderBy(stockMovements.sequence)
    : [];
  return {
    offset,
    hasMore: page.length > 100,
    rows: rows.map((r, index) => {
      const totals = new Map<string, bigint>();
      for (const c of compositions[index].components)
        totals.set(
          c.itemId,
          (totals.get(c.itemId) ?? 0n) + integer(c.quantity),
        );
      const { composition: _composition, ...order } = r.order;
      void _composition;
      return {
        ...order,
        name: r.name,
        baseUnit: r.baseUnit,
        location: r.location,
        assignee: r.assignee,
        preparation: r.preparation,
        result:
          actor.role === "staff"
            ? null
            : latestProductionResult(
                events.filter((e) => e.recordId === order.id),
              ),
        lots: movements
          .filter((m) => m.orderId === order.id && integer(m.quantity) !== 0n)
          .map(({ orderId: _orderId, ...m }) => {
            void _orderId;
            return m;
          }),
        components: [...totals].map(([itemId, total]) => ({
          itemId,
          name: componentItems.find((i) => i.id === itemId)?.name ?? "Artículo",
          baseUnit:
            componentItems.find((i) => i.id === itemId)?.baseUnit ?? "unit",
          reserved: six(total),
          untracked:
            compositions[index].untracked?.some((u) => u.itemId === itemId) ??
            false,
        })),
        events: events
          .filter((e) => e.recordId === order.id)
          .map((e) => {
            const after = e.after as Record<string, unknown>;
            return {
              action: e.action,
              at: e.at,
              actor: e.actor,
              previousResult:
                actor.role === "staff" || e.action !== "review-result"
                  ? null
                  : e.before,
              totalCost: actor.role === "staff" ? undefined : after.totalCost,
              assignee:
                people.find((p) => p.id === after.assignedTo)?.name ?? null,
              scheduledFor:
                typeof after.scheduledFor === "string"
                  ? after.scheduledFor
                  : null,
              reason: typeof after.reason === "string" ? after.reason : null,
              actualQuantity:
                typeof after.actualQuantity === "string"
                  ? after.actualQuantity
                  : null,
              plannedQuantity:
                typeof after.plannedQuantity === "string"
                  ? after.plannedQuantity
                  : null,
              consumption: Array.isArray(after.consumption)
                ? after.consumption
                : null,
            };
          }),
      };
    }),
  };
}
