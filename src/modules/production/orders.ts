import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/db/types";
import {
  recipes,
  recipeVersions,
  recipeLines,
  recipeOptions,
} from "@/db/recipe-schema";
import { items } from "@/db/item-schema";
import { productionOrders } from "@/db/production-order-schema";
import { stockDocuments } from "@/db/inventory-document-schema";
import {
  stockReservations,
  reservationAllocations,
} from "@/db/reservation-schema";
import { inventoryLots } from "@/db/inventory-schema";
import type { OperationalContext } from "../operations/types";
import { reserveStock, settleReservation } from "../inventory/reservations";
import { postMovement } from "../inventory/ledger";
import { lockStock } from "../inventory/locking";
import {
  integer,
  six,
  safeQuantity,
  exactDivision,
} from "../inventory/decimal";
import { businessDate } from "../operations/business-date";
import { AppError } from "@/lib/errors";
import { lotLocationBalances } from "@/db/stock-schema";
import { allocateFefo } from "../inventory/availability";
import type { StockAllocation } from "../operations/types";
import { auditEvents } from "@/db/business-schema";
import { planConsumption } from "./consumption";
const decimal = z
  .string()
  .regex(/^\d{1,12}\.\d{6}$/)
  .refine((v) => integer(v) > 0n);
function fail(message: string): never {
  throw new AppError("PRODUCTION_CONFLICT", message, 409);
}
const confirmSchema = z
  .object({
    recipeVersionId: z.uuid(),
    locationId: z.uuid(),
    plannedQuantity: decimal,
    selections: z
      .array(
        z.object({ lineId: z.uuid(), optionId: z.uuid().nullable() }).strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();
export async function confirmProduction(
  tx: Tx,
  ctx: OperationalContext,
  operationId: string,
  raw: unknown,
) {
  const input = confirmSchema.parse(raw);
  const [recipe] = await tx
    .select({ recipe: recipes, version: recipeVersions })
    .from(recipeVersions)
    .innerJoin(recipes, eq(recipes.id, recipeVersions.recipeId))
    .where(eq(recipeVersions.id, input.recipeVersionId));
  if (
    !recipe ||
    recipe.recipe.kind !== "preparation" ||
    recipe.recipe.revision !== recipe.version.version ||
    !recipe.recipe.outputItemId
  )
    fail("La preparación cambió. Actualizá su receta.");
  const lines = await tx
    .select()
    .from(recipeLines)
    .where(eq(recipeLines.versionId, input.recipeVersionId));
  if (
    input.selections.length !== lines.length ||
    new Set(input.selections.map((s) => s.lineId)).size !== lines.length
  )
    fail("Confirmá una selección por línea de la receta.");
  const components: { itemId: string; quantity: string }[] = [];
  for (const choice of input.selections) {
    const line = lines.find((l) => l.id === choice.lineId);
    if (!line) fail("La selección no pertenece a esta receta.");
    if (choice.optionId === null) {
      if (!line.optional) fail("Falta una línea obligatoria.");
      continue;
    }
    const [option] = await tx
      .select()
      .from(recipeOptions)
      .where(
        and(
          eq(recipeOptions.id, choice.optionId),
          eq(recipeOptions.lineId, line.id),
        ),
      );
    if (!option) fail("La alternativa no pertenece a esta línea.");
    const quantity = safeQuantity(
      exactDivision(
        integer(option.quantity) * integer(input.plannedQuantity),
        integer(recipe.version.yieldQuantity),
      ),
    );
    components.push({ itemId: option.itemId, quantity });
  }
  await lockStock(
    tx,
    ctx,
    [...components, { itemId: recipe.recipe.outputItemId }].map((c) => ({
      itemId: c.itemId,
      locationId: input.locationId,
    })),
  );
  for (const c of components) {
    const [item] = await tx.select().from(items).where(eq(items.id, c.itemId));
    if (!item.recipeUsable || item.class === "unclassified")
      fail("La receta incluye un artículo no habilitado.");
  }
  const [order] = await tx
    .insert(productionOrders)
    .values({
      branchId: ctx.branchId,
      locationId: input.locationId,
      recipeVersionId: input.recipeVersionId,
      outputItemId: recipe.recipe.outputItemId,
      plannedQuantity: input.plannedQuantity,
      composition: { components, selections: input.selections },
    })
    .returning();
  const [document] = await tx
    .insert(stockDocuments)
    .values({
      branchId: ctx.branchId,
      kind: "production",
      productionOrderId: order.id,
    })
    .returning();
  await reserveStock(tx, ctx, {
    operationId,
    documentId: document.id,
    demands: components.map((c) => ({ ...c, locationId: input.locationId })),
  });
  return { id: order.id, revision: order.revision };
}
export async function finishProduction(
  tx: Tx,
  ctx: OperationalContext,
  operationId: string,
  orderId: string,
  raw: unknown,
) {
  if (ctx.role === "staff")
    throw new AppError(
      "FORBIDDEN",
      "Se requiere permiso de encargado para gestionar producción.",
      403,
    );
  const input = z
    .object({
      expectedRevision: z.number().int().positive(),
      actualQuantity: decimal.nullable(),
      outcome: z.enum(["completed", "cancelled"]).default("completed"),
      expiresOn: z.iso.date().nullable(),
      lotCode: z.string().trim().max(120).nullable(),
      reason: z.string().trim().min(1).max(2000),
      consumption: z
        .array(
          z
            .object({
              itemId: z.uuid(),
              quantity: z.string().regex(/^\d{1,12}\.\d{6}$/),
            })
            .strict(),
        )
        .min(1)
        .max(100),
    })
    .strict()
    .parse(raw);
  const [order] = await tx
    .select()
    .from(productionOrders)
    .where(
      and(
        eq(productionOrders.id, orderId),
        eq(productionOrders.branchId, ctx.branchId),
      ),
    )
    .for("update");
  if (
    !order ||
    order.state !== "confirmed" ||
    order.revision !== input.expectedRevision
  )
    fail("La producción cambió o ya terminó.");
  const [origin] = await tx
    .select({
      documentId: stockDocuments.id,
      reservationId: stockReservations.id,
    })
    .from(stockDocuments)
    .innerJoin(
      stockReservations,
      eq(stockReservations.documentId, stockDocuments.id),
    )
    .where(
      and(
        eq(stockDocuments.productionOrderId, order.id),
        eq(stockDocuments.branchId, ctx.branchId),
      ),
    );
  if (!origin) fail("Falta la reserva de la producción.");
  const reserved = await tx
    .select()
    .from(reservationAllocations)
    .where(eq(reservationAllocations.reservationId, origin.reservationId))
    .orderBy(
      reservationAllocations.itemId,
      reservationAllocations.locationId,
      reservationAllocations.lotId,
    );
  await lockStock(
    tx,
    ctx,
    [...reserved, { itemId: order.outputItemId, locationId: order.locationId }],
    true,
  );
  const planned = planConsumption(
    reserved.map((a) => ({
      itemId: a.itemId,
      lotId: a.lotId,
      locationId: a.locationId,
      quantity: six(
        integer(a.allocated) - integer(a.consumed) - integer(a.released),
      ),
    })),
    input.consumption,
  );
  const { consume, release } = planned,
    extra: StockAllocation[] = [];
  for (const demand of planned.extra) {
    const itemId = demand.itemId,
      needed = integer(demand.quantity);
    const lots = await tx
      .select({ lot: inventoryLots, balance: lotLocationBalances })
      .from(lotLocationBalances)
      .innerJoin(inventoryLots, eq(inventoryLots.id, lotLocationBalances.lotId))
      .where(
        and(
          eq(inventoryLots.itemId, itemId),
          eq(lotLocationBalances.locationId, order.locationId),
          eq(lotLocationBalances.branchId, ctx.branchId),
        ),
      )
      .orderBy(inventoryLots.id)
      .for("update");
    const chosen = allocateFefo(
      lots.map(({ lot, balance }) => ({
        id: lot.id,
        receivedOn: lot.receivedOn,
        expiresOn: lot.expiresOn,
        blocked: lot.blocked,
        locationBlocked: balance.blocked,
        quantity: integer(balance.quantity),
        reserved: integer(balance.reserved),
      })),
      needed,
      businessDate(new Date(), ctx.timeZone),
    );
    extra.push(
      ...chosen.map((a) => ({
        itemId,
        lotId: a.lotId,
        locationId: order.locationId,
        quantity: six(a.quantity),
      })),
    );
  }
  if (!consume.length && !extra.length)
    fail("La producción debe registrar materiales consumidos.");
  await settleReservation(tx, ctx, {
    operationId,
    reservationId: origin.reservationId,
    consume,
    release,
  });
  const costs = await postMovement(tx, ctx, {
    operationId,
    documentId: origin.documentId,
    action: input.outcome === "cancelled" ? "waste" : "production",
    reason: input.reason,
    legs: [...consume, ...extra].map((a) => ({
      ...a,
      direction: "out",
      incomingValue: null,
    })),
  });
  const totalCost = costs.some((c) => c.value === null)
    ? null
    : six(-costs.reduce((sum, c) => sum + integer(c.value!), 0n));
  // Reservations were settled and outgoing movements posted above, in the
  // same executeCommand transaction. A failed update rolls back both operations.
  if (input.outcome === "cancelled") {
    if (
      input.actualQuantity !== null ||
      input.expiresOn !== null ||
      input.lotCode !== null
    )
      fail("Una pérdida total no puede ingresar producción obtenida.");
    await tx
      .update(productionOrders)
      .set({
        state: "cancelled",
        actualQuantity: null,
        revision: order.revision + 1,
      })
      .where(eq(productionOrders.id, order.id));
    await tx.insert(auditEvents).values({
      actorId: ctx.actorId,
      entity: "production-orders",
      recordId: order.id,
      action: "cancel-consumed",
      after: {
        operationId,
        reason: input.reason,
        consumption: input.consumption,
        totalCost,
      },
    });
    return {
      id: order.id,
      revision: order.revision + 1,
      lotId: null,
      totalCost,
    };
  }
  if (input.actualQuantity === null) fail("Indicá la producción obtenida.");
  const today = businessDate(new Date(), ctx.timeZone);
  if (input.expiresOn !== null && input.expiresOn <= today)
    fail("El vencimiento debe ser posterior a la producción.");
  const usedLots = await tx
    .select({ expiresOn: inventoryLots.expiresOn })
    .from(inventoryLots)
    .where(
      inArray(inventoryLots.id, [
        ...new Set([...consume, ...extra].map((a) => a.lotId)),
      ]),
    );
  const earliest = usedLots
    .flatMap((l) => (l.expiresOn ? [l.expiresOn] : []))
    .sort()[0];
  if (input.expiresOn && earliest && input.expiresOn > earliest)
    fail(
      "El preparado no puede vencer después del lote consumido con vencimiento más próximo.",
    );
  const [lot] = await tx
    .insert(inventoryLots)
    .values({
      itemId: order.outputItemId,
      receivedOn: today,
      expiresOn: input.expiresOn,
      lotCode: input.lotCode,
      initialQuantity: input.actualQuantity,
      remainingQuantity: input.actualQuantity,
    })
    .returning();
  await postMovement(tx, ctx, {
    operationId,
    documentId: origin.documentId,
    action: "production",
    reason: null,
    legs: [
      {
        itemId: order.outputItemId,
        lotId: lot.id,
        locationId: order.locationId,
        quantity: input.actualQuantity,
        direction: "in",
        incomingValue: totalCost,
      },
    ],
  });
  await tx
    .update(productionOrders)
    .set({
      state: "completed",
      actualQuantity: input.actualQuantity,
      revision: order.revision + 1,
    })
    .where(eq(productionOrders.id, order.id));
  return {
    id: order.id,
    lotId: lot.id,
    revision: order.revision + 1,
    totalCost,
  };
}
export async function cancelUnusedProduction(
  tx: Tx,
  ctx: OperationalContext,
  operationId: string,
  orderId: string,
  raw: unknown,
) {
  if (ctx.role === "staff")
    throw new AppError(
      "FORBIDDEN",
      "Se requiere permiso de encargado para gestionar producción.",
      403,
    );
  const input = z
    .object({
      expectedRevision: z.number().int().positive(),
      unusedConfirmed: z.literal(true),
      reason: z.string().trim().min(1).max(2000),
    })
    .strict()
    .parse(raw);
  const [order] = await tx
    .select()
    .from(productionOrders)
    .where(
      and(
        eq(productionOrders.id, orderId),
        eq(productionOrders.branchId, ctx.branchId),
      ),
    )
    .for("update");
  if (
    !order ||
    order.state !== "confirmed" ||
    order.revision !== input.expectedRevision
  )
    fail("La producción cambió o ya terminó.");
  const [origin] = await tx
    .select({ reservationId: stockReservations.id })
    .from(stockDocuments)
    .innerJoin(
      stockReservations,
      eq(stockReservations.documentId, stockDocuments.id),
    )
    .where(
      and(
        eq(stockDocuments.productionOrderId, order.id),
        eq(stockDocuments.branchId, ctx.branchId),
      ),
    );
  if (!origin) fail("Falta la reserva de producción.");
  const rows = await tx
    .select()
    .from(reservationAllocations)
    .where(eq(reservationAllocations.reservationId, origin.reservationId));
  if (rows.some((a) => integer(a.consumed) > 0n))
    fail(
      "Ya se registró consumo; no se puede anular como materiales sin usar.",
    );
  await settleReservation(tx, ctx, {
    operationId,
    reservationId: origin.reservationId,
    consume: [],
    release: rows
      .map((a) => ({
        itemId: a.itemId,
        lotId: a.lotId,
        locationId: a.locationId,
        quantity: six(integer(a.allocated) - integer(a.released)),
      }))
      .filter((a) => integer(a.quantity) > 0n),
  });
  await tx
    .update(productionOrders)
    .set({ state: "cancelled", revision: order.revision + 1 })
    .where(eq(productionOrders.id, order.id));
  await tx.insert(auditEvents).values({
    actorId: ctx.actorId,
    entity: "production-orders",
    recordId: order.id,
    action: "cancel-unused",
    after: { operationId, reason: input.reason, unusedConfirmed: true },
  });
  return { id: order.id, revision: order.revision + 1 };
}
