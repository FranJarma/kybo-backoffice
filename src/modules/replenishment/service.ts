import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import { replenishmentPolicies } from "@/db/replenishment-schema";
import { locations } from "@/db/branch-schema";
import { items } from "@/db/item-schema";
import { inventoryLots } from "@/db/inventory-schema";
import { lotLocationBalances } from "@/db/stock-schema";
import { recipes, recipeVersions } from "@/db/recipe-schema";
import { productionOrders } from "@/db/production-order-schema";
import { user } from "@/db/auth-schema";
import { auditEvents } from "@/db/business-schema";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { requireOperationalContext } from "@/modules/branches/context";
import type { OperationalContext } from "@/modules/operations/types";
import { businessDate } from "@/modules/operations/business-date";
import { decimal, integer } from "@/modules/inventory/decimal";
import { buildReplenishmentAlerts } from "./engine";
import type { ReplenishmentPolicy, ReplenishmentSnapshot } from "./types";

const policySchema = z
  .object({
    id: z.uuid().optional(),
    revision: z.number().int().positive().optional(),
    itemId: z.uuid(),
    locationId: z.uuid(),
    minimumQuantity: z.string().max(80),
    targetQuantity: z.string().max(80),
    preparationMinutes: z.number().int().min(1).max(10080).nullable(),
    enabled: z.boolean(),
  })
  .strict()
  .refine((p) => Boolean(p.id) === Boolean(p.revision), {
    message: "La regla a editar necesita su revisión actual.",
  });

function conflict(): never {
  throw new AppError(
    "REPLENISHMENT_CONFLICT",
    "La regla cambió o ya existe para este artículo y ubicación. Actualizá los avisos antes de continuar.",
    409,
  );
}

/** executeCommand owns authorization revalidation, transaction and request idempotency. */
export async function saveReplenishmentPolicy(
  tx: Tx,
  ctx: OperationalContext,
  operationId: string,
  raw: unknown,
): Promise<ReplenishmentPolicy> {
  if (ctx.role === "staff")
    throw new AppError(
      "FORBIDDEN",
      "Solo el encargado puede configurar los avisos.",
      403,
    );
  const input = policySchema.parse(raw);
  const minimumQuantity = decimal(input.minimumQuantity, 6)!;
  const targetQuantity = decimal(input.targetQuantity, 6, true, true)!;
  if (
    integer(targetQuantity) < integer(minimumQuantity) ||
    (input.enabled && integer(targetQuantity) === integer(minimumQuantity))
  )
    throw new AppError(
      "VALIDATION",
      "El objetivo debe superar el mínimo para activar el aviso.",
      400,
    );
  const [item] = await tx
    .select({ id: items.id, name: items.name, baseUnit: items.baseUnit })
    .from(items)
    .where(
      and(
        eq(items.id, input.itemId),
        eq(items.stockTracked, true),
        isNull(items.archivedAt),
      ),
    )
    .for("share");
  const [location] = await tx
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(
      and(
        eq(locations.id, input.locationId),
        eq(locations.branchId, ctx.branchId),
        isNull(locations.archivedAt),
      ),
    )
    .for("share");
  if (!item || !location)
    throw new AppError(
      "VALIDATION",
      "Elegí un artículo con inventario y una ubicación activa de esta sucursal.",
      400,
    );
  const changes = {
    itemId: item.id,
    locationId: location.id,
    minimumQuantity,
    targetQuantity,
    preparationMinutes: input.preparationMinutes,
    enabled: input.enabled,
    updatedBy: ctx.actorId,
    updatedAt: new Date(),
  };
  let saved: typeof replenishmentPolicies.$inferSelect;
  let before: typeof replenishmentPolicies.$inferSelect | null = null;
  if (input.id) {
    const [previous] = await tx
      .select()
      .from(replenishmentPolicies)
      .where(
        and(
          eq(replenishmentPolicies.id, input.id),
          eq(replenishmentPolicies.branchId, ctx.branchId),
        ),
      )
      .for("update");
    if (!previous || previous.revision !== input.revision) conflict();
    const [existing] = await tx
      .select({ id: replenishmentPolicies.id })
      .from(replenishmentPolicies)
      .where(
        and(
          eq(replenishmentPolicies.branchId, ctx.branchId),
          eq(replenishmentPolicies.locationId, location.id),
          eq(replenishmentPolicies.itemId, item.id),
        ),
      );
    if (existing && existing.id !== previous.id) conflict();
    before = previous;
    [saved] = await tx
      .update(replenishmentPolicies)
      .set({ ...changes, revision: previous.revision + 1 })
      .where(eq(replenishmentPolicies.id, previous.id))
      .returning();
  } else {
    const [created] = await tx
      .insert(replenishmentPolicies)
      .values({ ...changes, branchId: ctx.branchId })
      .onConflictDoNothing()
      .returning();
    if (!created) conflict();
    saved = created;
  }
  await tx.insert(auditEvents).values({
    actorId: ctx.actorId,
    entity: "replenishment-policies",
    recordId: saved.id,
    action: before ? "update" : "create",
    before,
    after: { ...saved, operationId },
  });
  return {
    id: saved.id,
    revision: saved.revision,
    itemId: item.id,
    itemName: item.name,
    baseUnit: item.baseUnit,
    locationId: location.id,
    locationName: location.name,
    minimumQuantity: saved.minimumQuantity,
    targetQuantity: saved.targetQuantity,
    preparationMinutes: saved.preparationMinutes,
    enabled: saved.enabled,
  };
}

export async function getReplenishmentSnapshot(
  db: AppDb,
  actor: Actor,
  now = new Date(),
): Promise<ReplenishmentSnapshot> {
  const ctx = await requireOperationalContext(db, actor, actor.branchId ?? "");
  return db.transaction(async (tx) => readReplenishmentSnapshot(tx, ctx, now), {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
}

export async function readReplenishmentSnapshot(
  tx: Tx,
  ctx: OperationalContext,
  now: Date,
): Promise<ReplenishmentSnapshot> {
  // Explicit projections never expose item costs to staff. All stock reads share one snapshot.
  const policies = await tx
    .select({
      id: replenishmentPolicies.id,
      revision: replenishmentPolicies.revision,
      itemId: items.id,
      itemName: items.name,
      baseUnit: items.baseUnit,
      locationId: locations.id,
      locationName: locations.name,
      minimumQuantity: replenishmentPolicies.minimumQuantity,
      targetQuantity: replenishmentPolicies.targetQuantity,
      preparationMinutes: replenishmentPolicies.preparationMinutes,
      enabled: replenishmentPolicies.enabled,
    })
    .from(replenishmentPolicies)
    .innerJoin(items, eq(items.id, replenishmentPolicies.itemId))
    .innerJoin(
      locations,
      and(
        eq(locations.id, replenishmentPolicies.locationId),
        eq(locations.branchId, replenishmentPolicies.branchId),
      ),
    )
    .where(
      and(
        eq(replenishmentPolicies.branchId, ctx.branchId),
        eq(items.stockTracked, true),
        isNull(items.archivedAt),
        isNull(locations.archivedAt),
      ),
    )
    .orderBy(asc(locations.name), asc(items.name));
  const [branchLocations, catalog] = await Promise.all([
    tx
      .select({ id: locations.id, name: locations.name })
      .from(locations)
      .where(
        and(eq(locations.branchId, ctx.branchId), isNull(locations.archivedAt)),
      )
      .orderBy(asc(locations.name)),
    tx
      .select({ id: items.id, name: items.name, baseUnit: items.baseUnit })
      .from(items)
      .where(and(eq(items.stockTracked, true), isNull(items.archivedAt)))
      .orderBy(asc(items.name)),
  ]);
  const itemIds = [
    ...new Set(policies.filter((p) => p.enabled).map((p) => p.itemId)),
  ];
  const base = {
    policies,
    locations: branchLocations,
    items: catalog,
    asOf: now.toISOString(),
  };
  if (!itemIds.length) return { ...base, alerts: [] };
  const [lots, preparation, activeProduction] = await Promise.all([
    tx
      .select({
        id: inventoryLots.id,
        itemId: inventoryLots.itemId,
        locationId: locations.id,
        locationName: locations.name,
        receivedOn: inventoryLots.receivedOn,
        expiresOn: inventoryLots.expiresOn,
        blocked: inventoryLots.blocked,
        locationBlocked: lotLocationBalances.blocked,
        quantity: lotLocationBalances.quantity,
        reserved: lotLocationBalances.reserved,
      })
      .from(lotLocationBalances)
      .innerJoin(inventoryLots, eq(inventoryLots.id, lotLocationBalances.lotId))
      .innerJoin(
        locations,
        and(
          eq(locations.id, lotLocationBalances.locationId),
          eq(locations.branchId, lotLocationBalances.branchId),
        ),
      )
      .where(
        and(
          eq(lotLocationBalances.branchId, ctx.branchId),
          inArray(inventoryLots.itemId, itemIds),
          isNull(locations.archivedAt),
        ),
      ),
    tx
      .selectDistinct({ itemId: recipes.outputItemId })
      .from(recipes)
      .innerJoin(recipeVersions, eq(recipeVersions.recipeId, recipes.id))
      .where(
        and(
          eq(recipes.kind, "preparation"),
          inArray(recipes.outputItemId, itemIds),
        ),
      ),
    tx
      .select({
        id: productionOrders.id,
        itemId: productionOrders.outputItemId,
        locationId: productionOrders.locationId,
        plannedQuantity: productionOrders.plannedQuantity,
        state: productionOrders.state,
        assignedToName: user.name,
        startedAt: productionOrders.startedAt,
      })
      .from(productionOrders)
      .leftJoin(user, eq(user.id, productionOrders.assignedTo))
      .where(
        and(
          eq(productionOrders.branchId, ctx.branchId),
          inArray(productionOrders.outputItemId, itemIds),
          inArray(productionOrders.state, ["planned", "confirmed"]),
        ),
      )
      .orderBy(asc(productionOrders.createdAt)),
  ]);
  return {
    ...base,
    alerts: buildReplenishmentAlerts({
      policies,
      lots,
      preparationItemIds: preparation.flatMap((p) =>
        p.itemId ? [p.itemId] : [],
      ),
      activeProduction: activeProduction.map((order) => ({
        ...order,
        startedAt: order.startedAt?.toISOString() ?? null,
      })),
      today: businessDate(now, ctx.timeZone),
    }),
  };
}
