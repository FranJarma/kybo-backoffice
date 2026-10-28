import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
  purchaseOrders as orders,
  purchaseOrderLines as lines,
  purchaseOrderReceipts as allocations,
} from "@/db/procurement-schema";
import { purchaseReceiptLines, purchaseReceipts } from "@/db/inventory-schema";
import type { Tx } from "@/db/types";
import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { requireOperationalContext } from "../branches/context";
import { integer, safeQuantity } from "../inventory/decimal";
import type { PurchaseOrder, OrderSnapshot } from "./types";
import { orderFinancials } from "./advances";
export async function procurementAvailable(tx: Tx) {
  const result = await tx.execute(
    sql`select to_regclass('public.purchase_orders') as name`,
  );
  return !!result.rows[0]?.name;
}
export async function readOrder(
  tx: Tx,
  branchId: string,
  id: string,
): Promise<PurchaseOrder> {
  const [order] = await readOrders(tx, branchId, id);
  if (!order) throw new AppError("NOT_FOUND", "No se encontró el pedido.", 404);
  return order;
}
async function readOrders(
  tx: Tx,
  branchId: string,
  id?: string,
): Promise<PurchaseOrder[]> {
  const headers = await tx
    .select()
    .from(orders)
    .where(
      and(eq(orders.branchId, branchId), id ? eq(orders.id, id) : undefined),
    )
    .orderBy(
      sql`case when ${orders.state} in ('ordered','partially_received') then 0 when ${orders.state}='draft' then 1 else 2 end`,
      desc(orders.createdAt),
      desc(orders.id),
    )
    .limit(100);
  if (!headers.length) return [];
  const ids = headers.map((h) => h.id);
  const financials = await orderFinancials(tx, ids);
  const rows = await tx
    .select()
    .from(lines)
    .where(inArray(lines.orderId, ids))
    .orderBy(asc(lines.position));
  const receipts = await tx
    .selectDistinct({
      orderId: allocations.orderId,
      id: purchaseReceipts.id,
      receivedOn: purchaseReceipts.receivedOn,
      documentNumber: purchaseReceipts.documentNumber,
    })
    .from(allocations)
    .innerJoin(
      purchaseReceiptLines,
      eq(purchaseReceiptLines.id, allocations.receiptLineId),
    )
    .innerJoin(
      purchaseReceipts,
      eq(purchaseReceipts.id, purchaseReceiptLines.receiptId),
    )
    .where(inArray(allocations.orderId, ids));
  return headers.map((row) => ({
    ...row,
    financial: financials.get(row.id),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    lines: rows
      .filter((l) => l.orderId === row.id)
      .map((l) => ({
        ...l,
        pendingQuantity: safeQuantity(
          integer(l.orderedQuantity) -
            integer(l.receivedQuantity) -
            integer(l.cancelledQuantity),
        ),
      })),
    receipts: receipts
      .filter((r) => r.orderId === row.id)
      .map(({ id, receivedOn, documentNumber }) => ({
        id,
        receivedOn,
        documentNumber,
      })),
  }));
}
export async function getOrderSnapshot(
  db: AppDb,
  actor: Actor,
  id?: string,
): Promise<OrderSnapshot> {
  const ctx = await requireOperationalContext(db, actor, actor.branchId ?? "");
  if (ctx.role === "staff")
    throw new AppError(
      "FORBIDDEN",
      "Solo el encargado administra pedidos a proveedores.",
      403,
    );
  return db.transaction(
    async (tx) => {
      if (!(await procurementAvailable(tx)))
        return { available: false, orders: [] };
      const rows = await readOrders(tx, ctx.branchId, id);
      if (id && !rows.length)
        throw new AppError("NOT_FOUND", "No se encontró el pedido.", 404);
      return {
        available: true,
        orders: rows,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function pendingPurchaseSupply(tx: Tx, branchId: string) {
  if (!(await procurementAvailable(tx))) return [];
  const rows = await tx
    .select({
      id: lines.id,
      itemId: lines.itemId,
      ordered: lines.orderedQuantity,
      received: lines.receivedQuantity,
      cancelled: lines.cancelledQuantity,
      expectedOn: orders.expectedOn,
    })
    .from(lines)
    .innerJoin(orders, eq(orders.id, lines.orderId))
    .where(
      and(
        eq(orders.branchId, branchId),
        inArray(orders.state, ["ordered", "partially_received"]),
      ),
    );
  return rows
    .map((r) => ({
      ...r,
      quantity: safeQuantity(
        integer(r.ordered) - integer(r.received) - integer(r.cancelled),
      ),
    }))
    .filter((r) => integer(r.quantity) > 0n);
}
