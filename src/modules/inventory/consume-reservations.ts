import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import type { Tx } from "@/db/types";
import { stockDocuments } from "@/db/inventory-document-schema";
import { inventoryLots } from "@/db/inventory-schema";
import {
  stockOperations,
  inventoryValuations,
  locationStockBalances,
  lotLocationBalances,
} from "@/db/stock-schema";
import { stockMovements } from "@/db/stock-movement-schema";
import {
  stockReservations,
  reservationAllocations,
} from "@/db/reservation-schema";
import type { OperationalContext, StockAllocation } from "../operations/types";
import { lockStock } from "./locking";
import { nextValuation } from "./valuation";
import { integer, safeQuantity, safeScaled, six } from "./decimal";
import { convertToBase } from "../items/units";
import { businessDate } from "../operations/business-date";
import { AppError } from "@/lib/errors";

export type ReservedConsumption = {
  reservationId: string;
  documentId: string;
  action: "sale_consume" | "direct_dispatch";
  consume: StockAllocation[];
};
const fail = (message: string): never => {
  throw new AppError("STOCK_CONFLICT", message, 409);
};

/** Consume sale reservations as one batch; preserve caller leg order for valuation rounding. */
export async function consumeReservations(
  tx: Tx,
  ctx: OperationalContext,
  operationId: string,
  inputs: ReservedConsumption[],
) {
  if (!inputs.length) return;
  const [operation] = await tx
    .select({ id: stockOperations.id })
    .from(stockOperations)
    .where(
      and(
        eq(stockOperations.id, operationId),
        eq(stockOperations.branchId, ctx.branchId),
        eq(stockOperations.actorId, ctx.actorId),
      ),
    );
  const documents = await tx
    .select()
    .from(stockDocuments)
    .where(
      and(
        eq(stockDocuments.branchId, ctx.branchId),
        inArray(
          stockDocuments.id,
          inputs.map((i) => i.documentId),
        ),
      ),
    );
  if (
    !operation ||
    inputs.some(
      (i) => !documents.some((d) => d.id === i.documentId && d.kind === "sale"),
    )
  )
    fail("Falta el documento o la operación de esta sucursal.");
  if (
    new Set(inputs.map((i) => i.reservationId)).size !== inputs.length ||
    inputs.some((i) => !i.consume.length)
  )
    fail("La operación tiene reservas repetidas o sin movimientos.");
  const demands = inputs.flatMap((i) => i.consume);
  const tracked = await lockStock(tx, ctx, demands, true);
  if (demands.some((d) => !tracked.has(d.itemId)))
    fail(
      "Este artículo no controla inventario; no admite movimientos de stock.",
    );
  const reservations = await tx
    .select()
    .from(stockReservations)
    .where(
      and(
        eq(stockReservations.branchId, ctx.branchId),
        inArray(
          stockReservations.id,
          inputs.map((i) => i.reservationId),
        ),
      ),
    )
    .orderBy(asc(stockReservations.id))
    .for("update");
  if (
    inputs.some(
      (i) =>
        !reservations.some(
          (r) => r.id === i.reservationId && r.documentId === i.documentId,
        ),
    )
  )
    fail("La reserva no pertenece al documento de esta sucursal.");
  const allocations = await tx
    .select()
    .from(reservationAllocations)
    .where(
      and(
        eq(reservationAllocations.branchId, ctx.branchId),
        inArray(
          reservationAllocations.reservationId,
          inputs.map((i) => i.reservationId),
        ),
      ),
    )
    .orderBy(
      asc(reservationAllocations.itemId),
      asc(reservationAllocations.locationId),
      asc(reservationAllocations.lotId),
      asc(reservationAllocations.id),
    )
    .for("update");
  const lotPairs = [
    ...new Map(demands.map((d) => [`${d.lotId}/${d.locationId}`, d])).values(),
  ];
  const lots = await tx
    .select({ lot: inventoryLots, balance: lotLocationBalances })
    .from(lotLocationBalances)
    .innerJoin(inventoryLots, eq(inventoryLots.id, lotLocationBalances.lotId))
    .where(
      and(
        eq(lotLocationBalances.branchId, ctx.branchId),
        or(
          ...lotPairs.map((d) =>
            and(
              eq(lotLocationBalances.lotId, d.lotId),
              eq(lotLocationBalances.locationId, d.locationId),
            ),
          ),
        ),
      ),
    )
    .orderBy(asc(inventoryLots.id), asc(lotLocationBalances.locationId))
    .for("update");
  const pairs = [
    ...new Map(demands.map((d) => [`${d.itemId}/${d.locationId}`, d])).values(),
  ];
  const locations = await tx
    .select()
    .from(locationStockBalances)
    .where(
      and(
        eq(locationStockBalances.branchId, ctx.branchId),
        or(
          ...pairs.map((d) =>
            and(
              eq(locationStockBalances.itemId, d.itemId),
              eq(locationStockBalances.locationId, d.locationId),
            ),
          ),
        ),
      ),
    )
    .orderBy(
      asc(locationStockBalances.itemId),
      asc(locationStockBalances.locationId),
    )
    .for("update");
  const valuations = await tx
    .select()
    .from(inventoryValuations)
    .where(
      and(
        eq(inventoryValuations.branchId, ctx.branchId),
        inArray(inventoryValuations.itemId, [...tracked]),
      ),
    )
    .orderBy(asc(inventoryValuations.itemId))
    .for("update");
  const today = businessDate(new Date(), ctx.timeZone);
  const changedAllocations = new Map<
    string,
    typeof reservationAllocations.$inferSelect
  >();
  const changedLots = new Map<
    string,
    typeof lotLocationBalances.$inferSelect
  >();
  const changedLocations = new Map<
    string,
    typeof locationStockBalances.$inferSelect
  >();
  const changedValuations = new Map<
    string,
    typeof inventoryValuations.$inferSelect
  >();
  const movements: (typeof stockMovements.$inferInsert)[] = [];
  for (const input of inputs) {
    for (const leg of input.consume) {
      const q = integer(convertToBase(leg.quantity, "unit", "unit"));
      if (q <= 0n) fail("El movimiento debe tener una cantidad positiva.");
      const allocation = allocations.find(
        (a) =>
          a.reservationId === input.reservationId &&
          a.itemId === leg.itemId &&
          a.lotId === leg.lotId &&
          a.locationId === leg.locationId,
      );
      if (
        !allocation ||
        integer(allocation.allocated) -
          integer(allocation.consumed) -
          integer(allocation.released) <
          q
      )
        return fail("La reserva no alcanza para esta cantidad.");
      const entry = lots.find(
        (l) =>
          l.lot.id === leg.lotId && l.balance.locationId === leg.locationId,
      );
      const location = locations.find(
        (l) => l.itemId === leg.itemId && l.locationId === leg.locationId,
      );
      const valuation = valuations.find((v) => v.itemId === leg.itemId);
      if (!entry || entry.lot.itemId !== leg.itemId || !location || !valuation)
        return fail("El lote no corresponde al artículo o ubicación.");
      const { lot, balance } = entry;
      if (
        lot.blocked ||
        balance.blocked ||
        (lot.expiresOn !== null && lot.expiresOn <= today)
      )
        fail("El lote está bloqueado o vencido.");
      if (integer(balance.reserved) < q || integer(location.reserved) < q)
        fail("La reserva cambió. Actualizá antes de confirmar.");
      const valued = nextValuation(
        integer(valuation.quantity),
        valuation.value === null ? null : integer(valuation.value),
        -q,
        null,
      );
      for (const value of [valued.value, valued.appliedValue])
        if (value !== null) safeScaled(value, 24);
      allocation.consumed = six(integer(allocation.consumed) + q);
      balance.reserved = safeQuantity(integer(balance.reserved) - q);
      balance.quantity = safeQuantity(integer(balance.quantity) - q);
      balance.revision++;
      location.reserved = safeQuantity(integer(location.reserved) - q);
      location.quantity = safeQuantity(integer(location.quantity) - q);
      if (
        integer(balance.quantity) < integer(balance.reserved) ||
        integer(location.quantity) < integer(location.reserved)
      )
        fail("La cantidad está reservada o supera las existencias.");
      valuation.quantity = safeQuantity(valued.quantity);
      valuation.value = valued.value === null ? null : six(valued.value);
      changedAllocations.set(allocation.id, allocation);
      changedLots.set(`${leg.lotId}/${leg.locationId}`, balance);
      changedLocations.set(`${leg.itemId}/${leg.locationId}`, location);
      changedValuations.set(leg.itemId, valuation);
      movements.push({
        branchId: ctx.branchId,
        operationId,
        documentId: input.documentId,
        itemId: leg.itemId,
        lotId: leg.lotId,
        locationId: leg.locationId,
        action: input.action,
        quantity: six(-q),
        value: valued.appliedValue === null ? null : six(valued.appliedValue),
        reason: null,
      });
    }
  }
  await tx.execute(
    sql`update ${reservationAllocations} as a set consumed = d.consumed from (values ${sql.join(
      [...changedAllocations.values()].map(
        (a) => sql`(${a.id}::uuid, ${a.consumed}::numeric)`,
      ),
      sql`, `,
    )}) as d(id, consumed) where a.id = d.id and a.branch_id = ${ctx.branchId}::uuid`,
  );
  await tx.execute(
    sql`update ${lotLocationBalances} as b set quantity = d.quantity, reserved = d.reserved, revision = d.revision from (values ${sql.join(
      [...changedLots.values()].map(
        (b) =>
          sql`(${b.lotId}::uuid, ${b.locationId}::uuid, ${b.quantity}::numeric, ${b.reserved}::numeric, ${b.revision}::integer)`,
      ),
      sql`, `,
    )}) as d(lot_id, location_id, quantity, reserved, revision) where b.lot_id = d.lot_id and b.location_id = d.location_id and b.branch_id = ${ctx.branchId}::uuid`,
  );
  await tx.execute(
    sql`update ${locationStockBalances} as b set quantity = d.quantity, reserved = d.reserved from (values ${sql.join(
      [...changedLocations.values()].map(
        (b) =>
          sql`(${b.itemId}::uuid, ${b.locationId}::uuid, ${b.quantity}::numeric, ${b.reserved}::numeric)`,
      ),
      sql`, `,
    )}) as d(item_id, location_id, quantity, reserved) where b.item_id = d.item_id and b.location_id = d.location_id and b.branch_id = ${ctx.branchId}::uuid`,
  );
  await tx.execute(
    sql`update ${inventoryValuations} as v set quantity = d.quantity, value = d.value from (values ${sql.join(
      [...changedValuations.values()].map(
        (v) =>
          sql`(${v.itemId}::uuid, ${v.quantity}::numeric, ${v.value}::numeric)`,
      ),
      sql`, `,
    )}) as d(item_id, quantity, value) where v.item_id = d.item_id and v.branch_id = ${ctx.branchId}::uuid`,
  );
  const states = reservations.map((r) => ({
    id: r.id,
    state: allocations.some(
      (a) =>
        a.reservationId === r.id &&
        integer(a.allocated) > integer(a.consumed) + integer(a.released),
    )
      ? r.state
      : "settled",
  }));
  await tx.execute(
    sql`update ${stockReservations} as r set state = d.state from (values ${sql.join(
      states.map((r) => sql`(${r.id}::uuid, ${r.state}::text)`),
      sql`, `,
    )}) as d(id, state) where r.id = d.id and r.branch_id = ${ctx.branchId}::uuid`,
  );
  await tx.insert(stockMovements).values(movements);
}
