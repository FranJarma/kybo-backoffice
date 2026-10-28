import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { auditEvents, paymentMethods, suppliers } from "@/db/business-schema";
import { purchaseOrders, purchaseOrderReceipts } from "@/db/procurement-schema";
import { purchaseReceipts, purchaseReceiptLines } from "@/db/inventory-schema";
import {
  purchaseAdvances as advances,
  purchaseAdvanceApplications as applications,
} from "@/db/purchase-advance-schema";
import type { OperationalContext } from "../operations/types";
import { executeCommand } from "../operations/command";
import { businessDate } from "../operations/business-date";
import { cents, decimal, integer } from "../inventory/decimal";
import { lockCashSession, recordCashMovement } from "../cash/integration";
import type { PurchaseOrderFinancial } from "./types";

const advanceSchema = z
  .object({
    requestId: z.uuid(),
    supplierId: z.uuid(),
    expectedRevision: z.number().int().positive(),
    paymentMethodId: z.uuid(),
    paidOn: z.iso.date(),
    amount: z.unknown().transform((v) => decimal(v, 2, true, true)!),
    source: z.enum(["cash", "external"]),
    reference: z
      .string()
      .trim()
      .max(160)
      .nullish()
      .transform((v) => v || null),
  })
  .strict();
export async function purchaseAdvancesAvailable(tx: Tx) {
  const result = await tx.execute(
    sql`select to_regclass('public.purchase_advances') as name`,
  );
  return !!result.rows[0]?.name;
}
export async function purchasePaymentSourcesAvailable(tx: Tx) {
  const result = await tx.execute(
    sql`select exists(select 1 from information_schema.columns where table_schema='public' and table_name='purchase_payments' and column_name='source') as available`,
  );
  return result.rows[0]?.available === true;
}
export async function recordPurchaseAdvance(
  db: AppDb,
  actor: Actor,
  orderId: string,
  raw: unknown,
) {
  const parsed = advanceSchema.safeParse(raw);
  if (!parsed.success)
    throw new AppError(
      "VALIDATION",
      parsed.error.issues[0]?.message ?? "Revisá el anticipo.",
      400,
    );
  const input = parsed.data;
  return executeCommand(
    db,
    actor,
    actor.branchId ?? "",
    input,
    "purchase-advance",
    { orderId, ...input },
    async (tx, ctx) => {
      if (!(await purchaseAdvancesAvailable(tx)))
        throw new AppError(
          "MIGRATION_REQUIRED",
          "Falta habilitar los anticipos a proveedores.",
          409,
        );
      // Cash is always locked before the order, supplier, receipt or payment method.
      if (input.source === "cash") await lockCashSession(tx, ctx);
      const [order] = await tx
        .select()
        .from(purchaseOrders)
        .where(
          and(
            eq(purchaseOrders.id, orderId),
            eq(purchaseOrders.branchId, ctx.branchId),
          ),
        )
        .for("update");
      if (!order)
        throw new AppError(
          "NOT_FOUND",
          "El pedido no pertenece a esta sucursal.",
          404,
        );
      if (order.supplierId !== input.supplierId)
        throw new AppError(
          "CONFLICT",
          "El proveedor no corresponde al pedido.",
          409,
        );
      if (
        !["ordered", "partially_received"].includes(order.state) ||
        order.revision !== input.expectedRevision
      )
        throw new AppError(
          "CONFLICT",
          "El pedido cambió o está cerrado. Actualizalo antes de registrar el anticipo.",
          409,
        );
      if (
        input.paidOn < order.orderedOn ||
        input.paidOn > businessDate(new Date(), ctx.timeZone)
      )
        throw new AppError(
          "VALIDATION",
          "La fecha del anticipo debe estar entre el pedido y hoy.",
          400,
        );
      const [supplier] = await tx
        .select()
        .from(suppliers)
        .where(eq(suppliers.id, order.supplierId))
        .for("share");
      if (!supplier || supplier.archivedAt)
        throw new AppError("CONFLICT", "Elegí un proveedor activo.", 409);
      const [method] = await tx
        .select()
        .from(paymentMethods)
        .where(eq(paymentMethods.id, input.paymentMethodId))
        .for("share");
      if (!method || method.archivedAt)
        throw new AppError("CONFLICT", "Elegí un medio de pago activo.", 409);
      if (input.source === "cash" && method.kind !== "cash")
        throw new AppError(
          "VALIDATION",
          "Una salida del cajón requiere el medio Efectivo.",
          400,
        );
      const id = randomUUID();
      await tx.insert(advances).values({
        id,
        branchId: ctx.branchId,
        supplierId: order.supplierId,
        orderId,
        paymentMethodId: method.id,
        paymentMethodName: method.name,
        methodKind: method.kind,
        source: input.source,
        amount: input.amount,
        paidOn: input.paidOn,
        reference: input.reference,
        actorId: ctx.actorId,
      });
      if (input.source === "cash")
        await recordCashMovement(tx, ctx, {
          kind: "advance",
          amount: cents(-integer(input.amount)),
          sourceType: "purchase-advance",
          sourceId: id,
          methodKind: "cash",
          methodName: method.name,
          concept: `Anticipo a ${order.supplierName}`,
          reference: input.reference,
        });
      await tx.insert(auditEvents).values({
        actorId: ctx.actorId,
        entity: "purchase_advances",
        recordId: id,
        action: "advance",
        after: {
          orderId,
          supplierId: order.supplierId,
          amount: input.amount,
          source: input.source,
          paidOn: input.paidOn,
        },
      });
      return { id, orderId };
    },
  );
}

/** Caller serializes the order first; all receipt payments follow the same order. */
export async function applyPurchaseAdvances(
  tx: Tx,
  ctx: OperationalContext,
  receiptId: string,
  orderId: string,
) {
  if (!(await purchaseAdvancesAvailable(tx))) return;
  const [order] = await tx
    .select()
    .from(purchaseOrders)
    .where(
      and(
        eq(purchaseOrders.id, orderId),
        eq(purchaseOrders.branchId, ctx.branchId),
      ),
    )
    .for("update");
  const [receipt] = await tx
    .select()
    .from(purchaseReceipts)
    .where(
      and(
        eq(purchaseReceipts.id, receiptId),
        eq(purchaseReceipts.branchId, ctx.branchId),
      ),
    )
    .for("update");
  if (!receipt)
    throw new AppError(
      "NOT_FOUND",
      "La recepción no pertenece a esta sucursal.",
      404,
    );
  const [link] = await tx
    .select({ orderId: purchaseOrderReceipts.orderId })
    .from(purchaseOrderReceipts)
    .innerJoin(
      purchaseReceiptLines,
      eq(purchaseReceiptLines.id, purchaseOrderReceipts.receiptLineId),
    )
    .where(
      and(
        eq(purchaseReceiptLines.receiptId, receiptId),
        eq(purchaseOrderReceipts.orderId, orderId),
      ),
    )
    .limit(1);
  if (!order || !link || order.supplierId !== receipt.supplierId)
    throw new AppError(
      "CONFLICT",
      "El anticipo y la recepción no corresponden al mismo pedido y proveedor.",
      409,
    );
  if (receipt.totalAmount === null || order.state === "cancelled") return;
  const payable =
    integer(receipt.totalAmount) +
    (receipt.shippingSupplierId === receipt.supplierId
      ? integer(receipt.shippingAmount)
      : 0n);
  let remaining = payable - integer(receipt.paidAmount);
  if (remaining <= 0n) return;
  const rows = await tx
    .select()
    .from(advances)
    .where(
      and(
        eq(advances.orderId, orderId),
        eq(advances.branchId, ctx.branchId),
        eq(advances.supplierId, receipt.supplierId),
      ),
    )
    .orderBy(asc(advances.createdAt), asc(advances.id))
    .for("update");
  let applied = 0n;
  for (const advance of rows) {
    if (remaining === 0n) break;
    const available = integer(advance.amount) - integer(advance.appliedAmount);
    if (available <= 0n) continue;
    const amount = available < remaining ? available : remaining;
    // An application links an existing payment; it never creates a second payment.
    const [saved] = await tx
      .insert(applications)
      .values({
        advanceId: advance.id,
        receiptId,
        orderId,
        branchId: ctx.branchId,
        supplierId: receipt.supplierId,
        amount: cents(amount),
        actorId: ctx.actorId,
      })
      .onConflictDoNothing()
      .returning();
    if (!saved) continue;
    await tx
      .update(advances)
      .set({ appliedAmount: cents(integer(advance.appliedAmount) + amount) })
      .where(eq(advances.id, advance.id));
    remaining -= amount;
    applied += amount;
  }
  if (applied > 0n)
    await tx
      .update(purchaseReceipts)
      .set({ paidAmount: cents(integer(receipt.paidAmount) + applied) })
      .where(eq(purchaseReceipts.id, receiptId));
}

export async function orderFinancials(
  tx: Tx,
  orderIds: string[],
): Promise<Map<string, PurchaseOrderFinancial>> {
  const result = new Map<string, PurchaseOrderFinancial>();
  if (!orderIds.length || !(await purchaseAdvancesAvailable(tx))) return result;
  const rows = await tx
    .select()
    .from(advances)
    .where(inArray(advances.orderId, orderIds))
    .orderBy(asc(advances.createdAt), asc(advances.id));
  for (const id of orderIds) {
    const group = rows.filter((r) => r.orderId === id);
    const amount = group.reduce((n, r) => n + integer(r.amount), 0n),
      applied = group.reduce((n, r) => n + integer(r.appliedAmount), 0n);
    result.set(id, {
      available: true,
      advancedAmount: cents(amount),
      appliedAmount: cents(applied),
      availableAmount: cents(amount - applied),
      advances: group.map((r) => ({
        id: r.id,
        amount: r.amount,
        appliedAmount: r.appliedAmount,
        availableAmount: cents(integer(r.amount) - integer(r.appliedAmount)),
        source: r.source,
        paymentMethodName: r.paymentMethodName,
        paidOn: r.paidOn,
        reference: r.reference,
        createdAt: r.createdAt.toISOString(),
      })),
    });
  }
  return result;
}
export async function receiptAdvanceApplications(tx: Tx, receiptId: string) {
  if (!(await purchaseAdvancesAvailable(tx))) return [];
  return tx
    .select({
      id: applications.id,
      advanceId: advances.id,
      amount: applications.amount,
      paidOn: advances.paidOn,
      paymentMethodName: advances.paymentMethodName,
      source: advances.source,
      reference: advances.reference,
    })
    .from(applications)
    .innerJoin(advances, eq(advances.id, applications.advanceId))
    .where(eq(applications.receiptId, receiptId))
    .orderBy(asc(applications.createdAt), asc(applications.id));
}
