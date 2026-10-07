import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db/types";
import {
  stockReservations,
  reservationAllocations,
} from "@/db/reservation-schema";
import { stockDocuments } from "@/db/inventory-document-schema";
import { inventoryLots } from "@/db/inventory-schema";
import { lotLocationBalances } from "@/db/stock-schema";
import { sales, saleOrders, saleLines } from "@/db/sales-schema";
import { productionOrders } from "@/db/production-order-schema";
import { stockTransfers } from "@/db/transfer-schema";
import { auditEvents } from "@/db/business-schema";
import type { OperationalContext } from "../operations/types";
import { lockStock } from "./locking";
import { integer, six } from "./decimal";
import { businessDate } from "../operations/business-date";
import { AppError } from "@/lib/errors";
const fail = (): never => {
  throw new AppError(
    "RESERVATION_CONFLICT",
    "La reserva o el lote de reemplazo no están disponibles en esta ubicación.",
    409,
  );
};
/** Explicit reassignment within the same location, preserving the committed demand. */
export async function reassignReservation(
  tx: Tx,
  ctx: OperationalContext,
  input: {
    operationId: string;
    allocationId: string;
    replacementLotId: string;
    quantity: string;
    reason: string;
  },
) {
  if (ctx.role === "staff")
    throw new AppError(
      "FORBIDDEN",
      "Un encargado debe reasignar la reserva.",
      403,
    );
  const [identity] = await tx
    .select({ allocation: reservationAllocations, document: stockDocuments })
    .from(reservationAllocations)
    .innerJoin(
      stockReservations,
      eq(stockReservations.id, reservationAllocations.reservationId),
    )
    .innerJoin(
      stockDocuments,
      eq(stockDocuments.id, stockReservations.documentId),
    )
    .where(
      and(
        eq(reservationAllocations.id, input.allocationId),
        eq(reservationAllocations.branchId, ctx.branchId),
      ),
    );
  if (!identity || identity.allocation.lotId === input.replacementLotId) fail();
  const d = identity.document;
  if (d.saleLineId) {
    const [sale] = await tx
      .select({ id: sales.id })
      .from(saleLines)
      .innerJoin(saleOrders, eq(saleOrders.id, saleLines.orderId))
      .innerJoin(sales, eq(sales.id, saleOrders.saleId))
      .where(eq(saleLines.id, d.saleLineId));
    if (!sale) fail();
    const [locked] = await tx
      .select()
      .from(sales)
      .where(eq(sales.id, sale.id))
      .for("update");
    if (locked.status === "cancelled") fail();
  } else if (d.productionOrderId)
    await tx
      .select()
      .from(productionOrders)
      .where(eq(productionOrders.id, d.productionOrderId))
      .for("update");
  else if (d.transferId) {
    // Transfer allocations carry lot identity; cancel and reconfirm instead.
    await tx
      .select()
      .from(stockTransfers)
      .where(eq(stockTransfers.id, d.transferId))
      .for("update");
    throw new AppError(
      "TRANSFER_RECONFIRM",
      "Anulá la reserva del traslado y confirmala nuevamente con lotes disponibles.",
      409,
    );
  } else fail();
  const a = identity.allocation;
  await lockStock(tx, ctx, [a], true);
  await tx
    .select()
    .from(stockReservations)
    .where(eq(stockReservations.id, a.reservationId))
    .for("update");
  const [current] = await tx
    .select()
    .from(reservationAllocations)
    .where(eq(reservationAllocations.id, a.id))
    .for("update");
  const q = integer(input.quantity);
  if (
    q <= 0n ||
    q >
      integer(current.allocated) -
        integer(current.consumed) -
        integer(current.released)
  )
    fail();
  const [replacement] = await tx
    .select({ lot: inventoryLots, balance: lotLocationBalances })
    .from(lotLocationBalances)
    .innerJoin(inventoryLots, eq(inventoryLots.id, lotLocationBalances.lotId))
    .where(
      and(
        eq(lotLocationBalances.lotId, input.replacementLotId),
        eq(lotLocationBalances.locationId, a.locationId),
        eq(inventoryLots.itemId, a.itemId),
      ),
    )
    .for("update");
  if (
    !replacement ||
    replacement.lot.blocked ||
    replacement.balance.blocked ||
    (replacement.lot.expiresOn !== null &&
      replacement.lot.expiresOn <= businessDate(new Date(), ctx.timeZone)) ||
    integer(replacement.balance.quantity) -
      integer(replacement.balance.reserved) <
      q
  )
    fail();
  await tx
    .update(reservationAllocations)
    .set({ released: six(integer(current.released) + q) })
    .where(eq(reservationAllocations.id, a.id));
  await tx
    .update(lotLocationBalances)
    .set({
      reserved: sql`${lotLocationBalances.reserved}-${input.quantity}::numeric`,
    })
    .where(
      and(
        eq(lotLocationBalances.lotId, a.lotId),
        eq(lotLocationBalances.locationId, a.locationId),
      ),
    );
  await tx
    .update(lotLocationBalances)
    .set({
      reserved: sql`${lotLocationBalances.reserved}+${input.quantity}::numeric`,
    })
    .where(
      and(
        eq(lotLocationBalances.lotId, input.replacementLotId),
        eq(lotLocationBalances.locationId, a.locationId),
      ),
    );
  await tx
    .insert(reservationAllocations)
    .values({
      reservationId: a.reservationId,
      branchId: ctx.branchId,
      itemId: a.itemId,
      lotId: input.replacementLotId,
      locationId: a.locationId,
      allocated: input.quantity,
    })
    .onConflictDoUpdate({
      target: [
        reservationAllocations.reservationId,
        reservationAllocations.lotId,
        reservationAllocations.locationId,
      ],
      set: {
        allocated: sql`${reservationAllocations.allocated}+${input.quantity}::numeric`,
      },
    });
  await tx.insert(auditEvents).values({
    actorId: ctx.actorId,
    entity: "stock-reservations",
    recordId: a.reservationId,
    action: "reassign",
    after: { ...input, fromLotId: a.lotId, locationId: a.locationId },
  });
  const outstanding = await tx
    .select({ lot: inventoryLots, balance: lotLocationBalances })
    .from(reservationAllocations)
    .innerJoin(
      inventoryLots,
      eq(inventoryLots.id, reservationAllocations.lotId),
    )
    .innerJoin(
      lotLocationBalances,
      and(
        eq(lotLocationBalances.lotId, reservationAllocations.lotId),
        eq(lotLocationBalances.locationId, reservationAllocations.locationId),
      ),
    )
    .where(
      and(
        eq(reservationAllocations.reservationId, a.reservationId),
        sql`${reservationAllocations.allocated}>${reservationAllocations.consumed}+${reservationAllocations.released}`,
      ),
    );
  const today = businessDate(new Date(), ctx.timeZone);
  const affected = outstanding.some(
    (r) =>
      r.lot.blocked ||
      r.balance.blocked ||
      (r.lot.expiresOn !== null && r.lot.expiresOn <= today),
  );
  await tx
    .update(stockReservations)
    .set({
      state: outstanding.length
        ? affected
          ? "affected"
          : "active"
        : "settled",
    })
    .where(eq(stockReservations.id, a.reservationId));
  return { reservationId: a.reservationId };
}
