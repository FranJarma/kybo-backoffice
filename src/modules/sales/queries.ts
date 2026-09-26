import { and, asc, count, eq, inArray, sql } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { sales, saleOrders, saleLines, salePayments } from "@/db/sales-schema";
import { notFound, type Tx } from "@/modules/inventory/service";
import { cents, integer } from "@/modules/inventory/decimal";
import type {
  SaleDetail,
  SaleSummary,
  SaleOrigin,
  SaleChannel,
  SaleStatus,
  SalePayment,
} from "./types";

export async function summaries(
  db: AppDb | Tx,
  rows: (typeof sales.$inferSelect)[],
): Promise<SaleSummary[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const counts = await db
    .select({ id: saleOrders.saleId, total: count() })
    .from(saleOrders)
    .where(inArray(saleOrders.saleId, ids))
    .groupBy(saleOrders.saleId);
  const payments = await db
    .select({
      id: salePayments.saleId,
      collector: salePayments.collector,
      total: sql<string>`sum(case when ${salePayments.kind} = 'refund' then -${salePayments.amount} else ${salePayments.amount} end)::numeric(14,2)`,
    })
    .from(salePayments)
    .where(inArray(salePayments.saleId, ids))
    .groupBy(salePayments.saleId, salePayments.collector);
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    revision: r.revision,
    origin: r.origin as SaleOrigin,
    channel: r.channel as SaleChannel,
    fulfillment: r.fulfillment,
    status: r.status as SaleStatus,
    tableId: r.tableId,
    tableName: r.tableName,
    customerId: r.customerId,
    customerName: r.customerName,
    externalId: r.externalId,
    totalAmount: r.totalAmount,
    paidAmount: r.paidAmount,
    balanceDue:
      r.status === "cancelled"
        ? "0.00"
        : cents(integer(r.totalAmount) - integer(r.paidAmount)),
    localCollected:
      payments.find((p) => p.id === r.id && p.collector === "local")?.total ??
      "0.00",
    platformCollected:
      payments.find((p) => p.id === r.id && p.collector === "platform")
        ?.total ?? "0.00",
    orderCount: counts.find((c) => c.id === r.id)?.total ?? 0,
    businessDate: r.businessDate,
    createdAt: r.createdAt.toISOString(),
    closedAt: r.closedAt?.toISOString() ?? null,
  }));
}
export async function saleDetail(
  db: AppDb | Tx,
  id: string,
): Promise<SaleDetail> {
  const [row] = await db.select().from(sales).where(eq(sales.id, id));
  if (!row) notFound();
  const orders = await db
    .select()
    .from(saleOrders)
    .where(eq(saleOrders.saleId, id))
    .orderBy(asc(saleOrders.sequence));
  const lines = await db
    .select({ line: saleLines, orderId: saleOrders.id })
    .from(saleLines)
    .innerJoin(
      saleOrders,
      and(eq(saleOrders.id, saleLines.orderId), eq(saleOrders.saleId, id)),
    )
    .orderBy(asc(saleLines.position));
  const payments = await db
    .select()
    .from(salePayments)
    .where(eq(salePayments.saleId, id))
    .orderBy(asc(salePayments.createdAt), asc(salePayments.id));
  return {
    ...(await summaries(db, [row]))[0],
    notes: row.notes,
    cancelReason: row.cancelReason,
    orders: orders.map((o) => ({
      id: o.id,
      sequence: o.sequence,
      totalAmount: o.totalAmount,
      notes: o.notes,
      createdAt: o.createdAt.toISOString(),
      lines: lines
        .filter((l) => l.orderId === o.id)
        .map(({ line: l }) => ({
          id: l.id,
          productId: l.productId,
          name: l.name,
          quantity: l.quantity,
          listPrice: l.listPrice,
          unitPrice: l.unitPrice,
          lineTotal: l.lineTotal,
          priceReason: l.priceReason,
          notes: l.notes,
          recipeVersionId: l.recipeVersionId,
        })),
    })),
    payments: payments.map((p) => ({
      id: p.id,
      kind: p.kind as SalePayment["kind"],
      collector: p.collector as SalePayment["collector"],
      methodName: p.methodName,
      amount: p.amount,
      reference: p.reference,
      originalPaymentId: p.originalPaymentId,
      createdAt: p.createdAt.toISOString(),
      actorId: p.actorId,
    })),
  };
}
