import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import type { Tx } from "@/db/types";
import { stockDocuments } from "@/db/inventory-document-schema";
import { inventoryLots } from "@/db/inventory-schema";
import { lotLocationBalances, locationStockBalances } from "@/db/stock-schema";
import {
  reservationAllocations,
  stockReservations,
} from "@/db/reservation-schema";
import type { OperationalContext } from "../operations/types";
import type { Demand } from "./reservations";
import { lockStock } from "./locking";
import { assertStockAvailable } from "./stock-shortages";
import { allocateFefo } from "./availability";
import { businessDate } from "../operations/business-date";
import { integer, six } from "./decimal";
import { convertToBase } from "../items/units";
import { AppError } from "@/lib/errors";

/** Reserve an entire order under one set of stock locks, with one document per line. */
export async function reserveStockBatch(
  tx: Tx,
  ctx: OperationalContext,
  operationId: string,
  inputs: { documentId: string; demands: Demand[] }[],
) {
  if (!inputs.length) return [];
  const documents = await tx
    .select({ id: stockDocuments.id })
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
    new Set(inputs.map((i) => i.documentId)).size !== inputs.length ||
    documents.length !== inputs.length
  )
    throw new AppError(
      "RESERVATION_CONFLICT",
      "La reserva no pertenece a esta sucursal.",
      409,
    );
  const groups = inputs.map((input) => {
    const demands = new Map<string, Demand>();
    for (const d of input.demands) {
      const quantity = integer(convertToBase(d.quantity, "unit", "unit"));
      if (quantity <= 0n)
        throw new AppError("VALIDATION", "La reserva debe ser positiva.", 400);
      const key = `${d.itemId}/${d.locationId}`;
      demands.set(key, {
        ...d,
        quantity: six(quantity + integer(demands.get(key)?.quantity ?? "0")),
      });
    }
    return {
      ...input,
      reservationId: randomUUID(),
      demands: [...demands.values()],
    };
  });
  const demands = groups.flatMap((g) => g.demands);
  const tracked = await lockStock(tx, ctx, demands);
  await assertStockAvailable(tx, ctx, demands, tracked);
  const pairs = [
    ...new Map(
      demands
        .filter((d) => tracked.has(d.itemId))
        .map((d) => [`${d.itemId}/${d.locationId}`, d]),
    ).values(),
  ];
  const lots = pairs.length
    ? await tx
        .select({ lot: inventoryLots, balance: lotLocationBalances })
        .from(lotLocationBalances)
        .innerJoin(
          inventoryLots,
          eq(inventoryLots.id, lotLocationBalances.lotId),
        )
        .where(
          and(
            eq(lotLocationBalances.branchId, ctx.branchId),
            or(
              ...pairs.map((d) =>
                and(
                  eq(inventoryLots.itemId, d.itemId),
                  eq(lotLocationBalances.locationId, d.locationId),
                ),
              ),
            ),
          ),
        )
        .orderBy(asc(inventoryLots.id), asc(lotLocationBalances.locationId))
        .for("update")
    : [];
  const today = businessDate(new Date(), ctx.timeZone);
  const allocations: (typeof reservationAllocations.$inferInsert)[] = [];
  const lotDeltas = new Map<
    string,
    { lotId: string; locationId: string; quantity: bigint }
  >();
  const locationDeltas = new Map<
    string,
    { itemId: string; locationId: string; quantity: bigint }
  >();
  for (const g of groups) {
    for (const demand of g.demands.filter((d) => tracked.has(d.itemId))) {
      const candidates = lots.filter(
        (l) =>
          l.lot.itemId === demand.itemId &&
          l.balance.locationId === demand.locationId,
      );
      const selected = allocateFefo(
        candidates.map(({ lot, balance }) => ({
          id: lot.id,
          receivedOn: lot.receivedOn,
          expiresOn: lot.expiresOn,
          blocked: lot.blocked,
          locationBlocked: balance.blocked,
          quantity: integer(balance.quantity),
          reserved: integer(balance.reserved),
        })),
        integer(demand.quantity),
        today,
      );
      for (const chosen of selected) {
        const row = candidates.find((l) => l.lot.id === chosen.lotId)!;
        // Later lines must see the quantities allocated to earlier lines in this batch.
        row.balance.reserved = six(
          integer(row.balance.reserved) + chosen.quantity,
        );
        const key = `${chosen.lotId}/${demand.locationId}`;
        lotDeltas.set(key, {
          lotId: chosen.lotId,
          locationId: demand.locationId,
          quantity: (lotDeltas.get(key)?.quantity ?? 0n) + chosen.quantity,
        });
        allocations.push({
          reservationId: g.reservationId,
          branchId: ctx.branchId,
          itemId: demand.itemId,
          lotId: chosen.lotId,
          locationId: demand.locationId,
          allocated: six(chosen.quantity),
        });
      }
      const key = `${demand.itemId}/${demand.locationId}`;
      locationDeltas.set(key, {
        itemId: demand.itemId,
        locationId: demand.locationId,
        quantity:
          (locationDeltas.get(key)?.quantity ?? 0n) + integer(demand.quantity),
      });
    }
  }
  await tx
    .insert(stockReservations)
    .values(
      groups.map((g) => ({
        id: g.reservationId,
        branchId: ctx.branchId,
        documentId: g.documentId,
        operationId,
        state: g.demands.some((d) => tracked.has(d.itemId))
          ? "active"
          : "settled",
      })),
    );
  if (allocations.length) {
    await tx.execute(
      sql`update ${lotLocationBalances} as b set reserved = b.reserved + d.quantity from (values ${sql.join(
        [...lotDeltas.values()].map(
          (d) =>
            sql`(${d.lotId}::uuid, ${d.locationId}::uuid, ${six(d.quantity)}::numeric)`,
        ),
        sql`, `,
      )}) as d(lot_id, location_id, quantity) where b.lot_id = d.lot_id and b.location_id = d.location_id and b.branch_id = ${ctx.branchId}::uuid`,
    );
    await tx.insert(reservationAllocations).values(allocations);
    await tx.execute(
      sql`update ${locationStockBalances} as b set reserved = b.reserved + d.quantity from (values ${sql.join(
        [...locationDeltas.values()].map(
          (d) =>
            sql`(${d.itemId}::uuid, ${d.locationId}::uuid, ${six(d.quantity)}::numeric)`,
        ),
        sql`, `,
      )}) as d(item_id, location_id, quantity) where b.item_id = d.item_id and b.location_id = d.location_id and b.branch_id = ${ctx.branchId}::uuid`,
    );
  }
  return groups.map((g) => ({
    documentId: g.documentId,
    reservationId: g.reservationId,
  }));
}
