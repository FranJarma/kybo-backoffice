import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db/types";
import {
  stockReservations,
  reservationAllocations,
} from "@/db/reservation-schema";
import { inventoryLots } from "@/db/inventory-schema";
import {
  lotLocationBalances,
  locationStockBalances,
  stockOperations,
} from "@/db/stock-schema";
import { stockDocuments } from "@/db/inventory-document-schema";
import type { OperationalContext, StockAllocation } from "../operations/types";
import { lockStock } from "./locking";
import { allocateFefo } from "./availability";
import { businessDate } from "../operations/business-date";
import { integer, six } from "./decimal";
import { convertToBase } from "../items/units";
import { AppError } from "@/lib/errors";
export type Demand = { itemId: string; locationId: string; quantity: string };
function quantity(value: string) {
  return integer(convertToBase(value, "unit", "unit"));
}
const conflict = () => {
  throw new AppError(
    "RESERVATION_CONFLICT",
    "La reserva cambió o no pertenece a esta sucursal.",
    409,
  );
};

/** Caller owns command identity and locks operational documents before entering. */
export async function reserveStock(
  tx: Tx,
  ctx: OperationalContext,
  input: { operationId: string; documentId: string; demands: Demand[] },
): Promise<{ reservationId: string; allocations: StockAllocation[] }> {
  const [document] = await tx
    .select()
    .from(stockDocuments)
    .where(
      and(
        eq(stockDocuments.id, input.documentId),
        eq(stockDocuments.branchId, ctx.branchId),
      ),
    );
  if (!document) conflict();
  const demands = new Map<string, Demand>();
  for (const d of input.demands) {
    const key = `${d.itemId}/${d.locationId}`;
    const q = quantity(d.quantity);
    if (q <= 0n) conflict();
    demands.set(key, {
      ...d,
      quantity: six(
        q + (demands.has(key) ? quantity(demands.get(key)!.quantity) : 0n),
      ),
    });
  }
  if (!demands.size) conflict();
  const ordered = [...demands.values()].sort(
    (a, b) =>
      a.itemId.localeCompare(b.itemId) ||
      a.locationId.localeCompare(b.locationId),
  );
  await lockStock(tx, ctx, ordered);
  const [reservation] = await tx
    .insert(stockReservations)
    .values({
      branchId: ctx.branchId,
      documentId: input.documentId,
      operationId: input.operationId,
    })
    .returning();
  const allocations: StockAllocation[] = [];
  for (const demand of ordered) {
    const lots = await tx
      .select({ lot: inventoryLots, balance: lotLocationBalances })
      .from(lotLocationBalances)
      .innerJoin(inventoryLots, eq(inventoryLots.id, lotLocationBalances.lotId))
      .where(
        and(
          eq(lotLocationBalances.branchId, ctx.branchId),
          eq(lotLocationBalances.locationId, demand.locationId),
          eq(inventoryLots.itemId, demand.itemId),
        ),
      )
      .orderBy(inventoryLots.id)
      .for("update");
    const selected = allocateFefo(
      lots.map(({ lot, balance }) => ({
        id: lot.id,
        receivedOn: lot.receivedOn,
        expiresOn: lot.expiresOn,
        blocked: lot.blocked,
        locationBlocked: balance.blocked,
        quantity: integer(balance.quantity),
        reserved: integer(balance.reserved),
      })),
      quantity(demand.quantity),
      businessDate(new Date(), ctx.timeZone),
    );
    for (const chosen of selected) {
      const q = six(chosen.quantity);
      await tx
        .update(lotLocationBalances)
        .set({ reserved: sql`${lotLocationBalances.reserved} + ${q}::numeric` })
        .where(
          and(
            eq(lotLocationBalances.lotId, chosen.lotId),
            eq(lotLocationBalances.locationId, demand.locationId),
          ),
        );
      await tx.insert(reservationAllocations).values({
        reservationId: reservation.id,
        branchId: ctx.branchId,
        itemId: demand.itemId,
        lotId: chosen.lotId,
        locationId: demand.locationId,
        allocated: q,
      });
      allocations.push({
        itemId: demand.itemId,
        lotId: chosen.lotId,
        locationId: demand.locationId,
        quantity: q,
      });
    }
    await tx
      .update(locationStockBalances)
      .set({
        reserved: sql`${locationStockBalances.reserved} + ${demand.quantity}::numeric`,
      })
      .where(
        and(
          eq(locationStockBalances.itemId, demand.itemId),
          eq(locationStockBalances.locationId, demand.locationId),
        ),
      );
  }
  return { reservationId: reservation.id, allocations };
}

/** Only updates reservation counters. Consumption must be posted in the same transaction by the caller. */
export async function settleReservation(
  tx: Tx,
  ctx: OperationalContext,
  input: {
    reservationId: string;
    consume: StockAllocation[];
    release: StockAllocation[];
    operationId: string;
  },
): Promise<void> {
  const [operation] = await tx
    .select()
    .from(stockOperations)
    .where(
      and(
        eq(stockOperations.id, input.operationId),
        eq(stockOperations.branchId, ctx.branchId),
        eq(stockOperations.actorId, ctx.actorId),
      ),
    );
  if (!operation) conflict();
  const allocations = [...input.consume, ...input.release];
  await lockStock(tx, ctx, allocations, true);
  const [reservation] = await tx
    .select()
    .from(stockReservations)
    .where(
      and(
        eq(stockReservations.id, input.reservationId),
        eq(stockReservations.branchId, ctx.branchId),
      ),
    )
    .for("update");
  if (!reservation) conflict();
  const counters = new Map<
    string,
    { allocation: StockAllocation; consume: bigint; release: bigint }
  >();
  for (const [field, list] of [
    ["consume", input.consume],
    ["release", input.release],
  ] as const)
    for (const a of list) {
      const key = `${a.itemId}/${a.locationId}/${a.lotId}`;
      const counter = counters.get(key) ?? {
        allocation: a,
        consume: 0n,
        release: 0n,
      };
      const q = quantity(a.quantity);
      if (q <= 0n) conflict();
      counter[field] += q;
      counters.set(key, counter);
    }
  for (const [, { allocation: a, consume, release }] of [
    ...counters.entries(),
  ].sort(([a], [b]) => a.localeCompare(b))) {
    const [row] = await tx
      .select()
      .from(reservationAllocations)
      .where(
        and(
          eq(reservationAllocations.reservationId, reservation.id),
          eq(reservationAllocations.itemId, a.itemId),
          eq(reservationAllocations.locationId, a.locationId),
          eq(reservationAllocations.lotId, a.lotId),
        ),
      )
      .for("update");
    if (
      !row ||
      consume + release >
        integer(row.allocated) - integer(row.consumed) - integer(row.released)
    )
      conflict();
    await tx
      .update(reservationAllocations)
      .set({
        consumed: six(integer(row.consumed) + consume),
        released: six(integer(row.released) + release),
      })
      .where(eq(reservationAllocations.id, row.id));
    const total = six(consume + release);
    await tx
      .update(lotLocationBalances)
      .set({
        reserved: sql`${lotLocationBalances.reserved} - ${total}::numeric`,
      })
      .where(
        and(
          eq(lotLocationBalances.lotId, a.lotId),
          eq(lotLocationBalances.locationId, a.locationId),
        ),
      );
    await tx
      .update(locationStockBalances)
      .set({
        reserved: sql`${locationStockBalances.reserved} - ${total}::numeric`,
      })
      .where(
        and(
          eq(locationStockBalances.itemId, a.itemId),
          eq(locationStockBalances.locationId, a.locationId),
        ),
      );
  }
  const outstanding = await tx
    .select()
    .from(reservationAllocations)
    .where(
      and(
        eq(reservationAllocations.reservationId, reservation.id),
        sql`${reservationAllocations.allocated} > ${reservationAllocations.consumed} + ${reservationAllocations.released}`,
      ),
    )
    .limit(1);
  if (!outstanding.length)
    await tx
      .update(stockReservations)
      .set({ state: "settled" })
      .where(eq(stockReservations.id, reservation.id));
}
