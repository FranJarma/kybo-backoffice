import { and, eq, gt, inArray, lt, ne, or } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/db/types";
import { auditEvents } from "@/db/business-schema";
import { productionOrders } from "@/db/production-order-schema";
import { stockDocuments } from "@/db/inventory-document-schema";
import { stockMovements } from "@/db/stock-movement-schema";
import { inventoryLots } from "@/db/inventory-schema";
import { inventoryValuations, lotLocationBalances } from "@/db/stock-schema";
import { AppError } from "@/lib/errors";
import type { OperationalContext } from "../operations/types";
import {
  integer,
  six,
  roundedDivision,
  SCALE,
  safeScaled,
} from "../inventory/decimal";
import { lockStock } from "../inventory/locking";
import { postMovement } from "../inventory/ledger";
import { allocateFefo } from "../inventory/availability";
import { businessDate } from "../operations/business-date";
import { lockedProduction, productionManager } from "./access";
import { latestProductionResult } from "./result";

const quantity = z.string().regex(/^\d{1,12}\.\d{6}$/);
const schema = z
  .object({
    expectedRevision: z.number().int().positive(),
    actualQuantity: quantity,
    consumption: z
      .array(z.object({ itemId: z.uuid(), quantity }).strict())
      .min(1)
      .max(100),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();
function fail(message: string): never {
  throw new AppError("PRODUCTION_REVIEW", message, 409);
}

/** Runs inside executeCommand: all deltas, valuation and audit commit together. */
export async function reviewProductionResult(
  tx: Tx,
  ctx: OperationalContext,
  operationId: string,
  id: string,
  raw: unknown,
) {
  productionManager(ctx);
  const input = schema.parse(raw);
  const order = await lockedProduction(tx, ctx, id, input.expectedRevision);
  if (!["completed", "cancelled"].includes(order.state))
    fail("Solo se puede revisar una producción finalizada.");
  const events = await tx
    .select()
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.entity, "production-orders"),
        eq(auditEvents.recordId, id),
      ),
    );
  const previous = latestProductionResult(events);
  if (!previous) fail("Esta orden no tiene un resultado original revisable.");
  const composition = order.composition as {
    components: { itemId: string; quantity: string }[];
    untracked?: { itemId: string; unitCost: string | null }[];
  };
  const ids = [...new Set(composition.components.map((c) => c.itemId))];
  if (
    input.consumption.length !== ids.length ||
    new Set(input.consumption.map((c) => c.itemId)).size !== ids.length ||
    input.consumption.some((c) => !ids.includes(c.itemId))
  )
    fail(
      "Indicá una cantidad por cada ingrediente de la orden, sin agregar ni repetir artículos.",
    );
  if (
    integer(input.actualQuantity) > 0n &&
    !input.consumption.some((c) => integer(c.quantity) > 0n)
  )
    fail("La producción debe tener al menos un ingrediente consumido.");
  await lockStock(
    tx,
    ctx,
    [...ids, order.outputItemId].map((itemId) => ({
      itemId,
      locationId: order.locationId,
    })),
    true,
  );
  const [document] = await tx
    .select()
    .from(stockDocuments)
    .where(
      and(
        eq(stockDocuments.productionOrderId, id),
        eq(stockDocuments.branchId, ctx.branchId),
      ),
    );
  if (!document) fail("Falta el documento original de producción.");
  const movements = await tx
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.documentId, document.id))
    .orderBy(stockMovements.sequence);
  const original = movements.find(
    (m) => m.lotId === previous.lotId && integer(m.quantity) > 0n,
  );
  if (!original) fail("No se encontró el ingreso del lote producido.");
  const [used] = await tx
    .select({ id: stockMovements.id })
    .from(stockMovements)
    .where(
      and(
        ne(stockMovements.documentId, document.id),
        or(
          eq(stockMovements.lotId, previous.lotId),
          and(
            eq(stockMovements.branchId, ctx.branchId),
            eq(stockMovements.itemId, order.outputItemId),
            gt(stockMovements.sequence, original.sequence),
            lt(stockMovements.quantity, "0"),
          ),
        ),
      ),
    )
    .limit(1);
  const [outputLot] = await tx
    .select()
    .from(inventoryLots)
    .where(eq(inventoryLots.id, previous.lotId))
    .for("update");
  const [balance] = await tx
    .select()
    .from(lotLocationBalances)
    .where(
      and(
        eq(lotLocationBalances.lotId, previous.lotId),
        eq(lotLocationBalances.locationId, order.locationId),
      ),
    )
    .for("update");
  const today = businessDate(new Date(), ctx.timeZone);
  if (
    used ||
    !balance ||
    integer(balance.quantity) !== integer(previous.actualQuantity) ||
    integer(balance.reserved) > 0n
  )
    fail(
      "El stock producido ya tuvo movimientos posteriores o está reservado. No se puede corregir esta orden sin revisar esas operaciones.",
    );
  if (
    !outputLot ||
    outputLot.blocked ||
    balance.blocked ||
    (outputLot.expiresOn && outputLot.expiresOn <= today)
  )
    fail(
      "El lote producido está bloqueado o vencido. Revisá su estado antes de corregir la producción.",
    );
  const [beforeValue] = await tx
    .select()
    .from(inventoryValuations)
    .where(
      and(
        eq(inventoryValuations.itemId, order.outputItemId),
        eq(inventoryValuations.branchId, ctx.branchId),
      ),
    );
  const deltas = input.consumption.map((c) => ({
    itemId: c.itemId,
    quantity: six(
      integer(c.quantity) -
        integer(
          previous.consumption.find((p) => p.itemId === c.itemId)?.quantity ??
            "0",
        ),
    ),
  }));
  const untracked = composition.untracked ?? [];
  for (const c of deltas) {
    if (untracked.some((u) => u.itemId === c.itemId)) continue;
    const delta = integer(c.quantity);
    if (delta > 0n) {
      const lots = await tx
        .select({ lot: inventoryLots, balance: lotLocationBalances })
        .from(lotLocationBalances)
        .innerJoin(
          inventoryLots,
          eq(inventoryLots.id, lotLocationBalances.lotId),
        )
        .where(
          and(
            eq(inventoryLots.itemId, c.itemId),
            eq(lotLocationBalances.locationId, order.locationId),
            eq(lotLocationBalances.branchId, ctx.branchId),
          ),
        )
        .orderBy(inventoryLots.id)
        .for("update");
      const selected = allocateFefo(
        lots.map(({ lot, balance: b }) => ({
          id: lot.id,
          receivedOn: lot.receivedOn,
          expiresOn: lot.expiresOn,
          blocked: lot.blocked,
          locationBlocked: b.blocked,
          quantity: integer(b.quantity),
          reserved: integer(b.reserved),
        })),
        delta,
        today,
      );
      if (
        outputLot.expiresOn &&
        selected.some((s) => {
          const expiry = lots.find((l) => l.lot.id === s.lotId)?.lot.expiresOn;
          return expiry && expiry < outputLot.expiresOn!;
        })
      )
        fail("El ingrediente adicional vence antes que el lote producido.");
      await postMovement(tx, ctx, {
        operationId,
        documentId: document.id,
        action: "production",
        reason: input.reason,
        legs: selected.map((s) => ({
          itemId: c.itemId,
          locationId: order.locationId,
          lotId: s.lotId,
          quantity: six(s.quantity),
          direction: "out",
          incomingValue: null,
        })),
      });
    } else if (delta < 0n) {
      let remaining = -delta;
      const lots = new Map<
        string,
        { quantity: bigint; value: bigint | null }
      >();
      for (const m of movements.filter((m) => m.itemId === c.itemId)) {
        const prior = lots.get(m.lotId) ?? { quantity: 0n, value: 0n };
        lots.set(m.lotId, {
          quantity: prior.quantity - integer(m.quantity),
          value:
            prior.value === null || m.value === null
              ? null
              : prior.value - integer(m.value),
        });
      }
      for (const [lotId, consumed] of [...lots].reverse()) {
        if (remaining === 0n || consumed.quantity <= 0n) continue;
        const refund =
          remaining < consumed.quantity ? remaining : consumed.quantity;
        const value =
          consumed.value === null
            ? null
            : roundedDivision(consumed.value * refund, consumed.quantity);
        await postMovement(tx, ctx, {
          operationId,
          documentId: document.id,
          action: "production",
          reason: input.reason,
          legs: [
            {
              itemId: c.itemId,
              locationId: order.locationId,
              lotId,
              quantity: six(refund),
              direction: "in",
              incomingValue: value === null ? null : six(value),
            },
          ],
        });
        remaining -= refund;
      }
      if (remaining > 0n)
        fail("La devolución supera el consumo registrado de este ingrediente.");
    }
  }
  const corrected = await tx
    .select()
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.documentId, document.id),
        inArray(stockMovements.itemId, ids),
      ),
    );
  let cost: bigint | null = 0n;
  for (const c of input.consumption) {
    if (integer(c.quantity) === 0n) continue;
    const reference = untracked.find((u) => u.itemId === c.itemId);
    if (reference) {
      cost =
        cost === null || reference.unitCost === null
          ? null
          : cost +
            roundedDivision(
              integer(reference.unitCost) * integer(c.quantity),
              SCALE,
            );
    } else {
      const entries = corrected.filter((m) => m.itemId === c.itemId);
      cost =
        cost === null || entries.some((m) => m.value === null)
          ? null
          : cost - entries.reduce((sum, m) => sum + integer(m.value!), 0n);
    }
  }
  if (cost !== null && cost < 0n)
    fail("El costo corregido no puede ser negativo.");
  const outputDelta =
    integer(input.actualQuantity) - integer(previous.actualQuantity);
  if (outputDelta !== 0n)
    await postMovement(tx, ctx, {
      operationId,
      documentId: document.id,
      action: "production",
      reason: input.reason,
      legs: [
        {
          itemId: order.outputItemId,
          locationId: order.locationId,
          lotId: previous.lotId,
          quantity: six(outputDelta < 0n ? -outputDelta : outputDelta),
          direction: outputDelta < 0n ? "out" : "in",
          incomingValue: "0.000000",
        },
      ],
    });
  const [afterValue] = await tx
    .select()
    .from(inventoryValuations)
    .where(
      and(
        eq(inventoryValuations.itemId, order.outputItemId),
        eq(inventoryValuations.branchId, ctx.branchId),
      ),
    );
  const oldContribution =
    integer(previous.actualQuantity) === 0n
      ? 0n
      : previous.totalCost === null
        ? null
        : integer(previous.totalCost);
  const newContribution = integer(input.actualQuantity) === 0n ? 0n : cost;
  const target =
    integer(beforeValue.quantity) === integer(previous.actualQuantity)
      ? newContribution
      : beforeValue.value === null ||
          oldContribution === null ||
          newContribution === null
        ? null
        : integer(beforeValue.value) - oldContribution + newContribution;
  if (target !== null && target < 0n)
    fail(
      "La valoración ya no permite esta corrección; revisá los movimientos posteriores.",
    );
  if (
    target === null ||
    afterValue.value === null ||
    target !== integer(afterValue.value)
  ) {
    const valueDelta =
      target === null || afterValue.value === null
        ? null
        : six(safeScaled(target - integer(afterValue.value), 24));
    await tx
      .update(inventoryValuations)
      .set({ value: target === null ? null : six(safeScaled(target, 24)) })
      .where(
        and(
          eq(inventoryValuations.itemId, order.outputItemId),
          eq(inventoryValuations.branchId, ctx.branchId),
        ),
      );
    await tx
      .insert(stockMovements)
      .values({
        branchId: ctx.branchId,
        operationId,
        documentId: document.id,
        itemId: order.outputItemId,
        locationId: order.locationId,
        lotId: previous.lotId,
        action: "production_review",
        quantity: "0.000000",
        value: valueDelta,
        reason: input.reason,
      });
  }
  await tx
    .update(productionOrders)
    .set({
      actualQuantity:
        integer(input.actualQuantity) === 0n ? null : input.actualQuantity,
      state: integer(input.actualQuantity) === 0n ? "cancelled" : "completed",
      revision: order.revision + 1,
    })
    .where(eq(productionOrders.id, id));
  const result = {
    actualQuantity: input.actualQuantity,
    consumption: input.consumption,
    totalCost: cost === null ? null : six(safeScaled(cost, 24)),
    lotId: previous.lotId,
    revision: order.revision + 1,
    quantitySource: "reviewed",
  };
  await tx
    .insert(auditEvents)
    .values({
      actorId: ctx.actorId,
      entity: "production-orders",
      recordId: id,
      action: "review-result",
      before: previous,
      after: {
        ...result,
        operationId,
        reason: input.reason,
        outputDelta: six(outputDelta),
        consumptionDeltas: deltas,
        valuationBefore: beforeValue.value,
        valuationAfter: target === null ? null : six(target),
      },
    });
  return { id, ...result };
}
