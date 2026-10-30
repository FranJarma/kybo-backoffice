import {
  stockByBranch,
  lotsByBranch,
  movementsByBranch,
} from "./scoped-queries";
import { adjustAt } from "./scoped-adjustments";
import { lockStock } from "./locking";
import { postMovement } from "./ledger";
import { stockDocuments } from "@/db/inventory-document-schema";
import { businessDate as branchBusinessDate } from "../operations/business-date";
import { createHash, randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, sql } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";
import { requireCatalogAccess } from "@/lib/access";
import { AppError } from "@/lib/errors";
import {
  auditEvents,
  items,
  paymentMethods,
  purchasePresentations,
  suppliers,
} from "@/db/business-schema";
import {
  inventoryLots,
  inventoryMovements,
  inventoryOperations,
  purchasePayments,
  purchaseReceiptLines,
  purchaseReceipts,
  stockBalances,
} from "@/db/inventory-schema";
import {
  cents,
  exactDivision,
  integer,
  roundedDivision,
  safeQuantity,
  safeScaled,
  SCALE,
  six,
} from "./decimal";
import { parsePayment, parseReceive } from "./validation";
import { allocateShipping } from "./shipping";
import { stockOperations } from "@/db/stock-schema";
import { purchaseOrders, purchaseOrderReceipts } from "@/db/procurement-schema";
import {
  applyPurchaseAdvances,
  receiptAdvanceApplications,
  purchasePaymentSourcesAvailable,
} from "../procurement/advances";
import { lockCashSession, recordCashMovement } from "../cash/integration";
import {
  lockPurchaseReceipt,
  finishPurchaseReceipt,
} from "../procurement/receipts";
import { requireOperationalContext } from "../branches/context";
import type { OperationalContext } from "../operations/types";
import type {
  LotRow,
  MovementRow,
  ReceiptDetail,
  ReceiptSummary,
  StockResult,
} from "./types";

export type Tx = Parameters<Parameters<AppDb["transaction"]>[0]>[0];
export const invalid = (
  message: string,
  code = "VALIDATION",
  status = 400,
): never => {
  throw new AppError(code, message, status);
};
export const notFound = (): never =>
  invalid("No se encontró el registro.", "NOT_FOUND", 404);
export const conflict = (message: string): never =>
  invalid(message, "CONFLICT", 409);
const iso = (date: Date) => date.toISOString();
export const fingerprint = (kind: string, payload: unknown) =>
  createHash("sha256")
    .update(JSON.stringify([kind, payload]))
    .digest("hex");
export const businessDate = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Salta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
const searchTerm = (search: string) =>
  search
    .trim()
    .slice(0, 160)
    .replace(/[\\%_]/g, "\\$&");
function validId(id: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    invalid("Identificador inválido.");
}
function page(offset: number) {
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000)
    invalid("Página inválida.");
  return offset;
}
export async function claim(
  tx: Tx,
  actor: Actor,
  kind: string,
  requestId: string,
  hash: string,
  resultId: string,
  // Internal callers may reuse the context just read in this same transaction.
  validatedContext?: OperationalContext,
): Promise<string | null> {
  if (
    validatedContext &&
    (validatedContext.actorId !== actor.id ||
      validatedContext.branchId !== actor.branchId)
  )
    throw new AppError(
      "FORBIDDEN",
      "El contexto no corresponde a esta persona o sucursal.",
      403,
    );
  if (actor.branchId) {
    const ctx =
      validatedContext ??
      (await requireOperationalContext(tx, actor, actor.branchId));
    if (
      ctx.role === "staff" &&
      [
        "production",
        "receive",
        "pay",
        "prep-station",
        "prep-route",
        "sale-table",
        "sale-cancel",
      ].includes(kind)
    )
      throw new AppError(
        "FORBIDDEN",
        "Se requiere permiso vigente de encargado para realizar o repetir esta operación.",
        403,
      );
    const [inserted] = await tx
      .insert(stockOperations)
      .values({
        id: requestId,
        requestId,
        actorId: actor.id,
        branchId: ctx.branchId,
        action: kind,
        fingerprint: hash,
        result: { resultId },
      })
      .onConflictDoNothing()
      .returning();
    if (inserted) return null;
    const [previous] = await tx
      .select()
      .from(stockOperations)
      .where(eq(stockOperations.requestId, requestId));
    if (
      !previous ||
      previous.actorId !== actor.id ||
      previous.branchId !== ctx.branchId ||
      previous.action !== kind ||
      previous.fingerprint !== hash
    )
      conflict("Esta clave ya se usó para otra operación.");
    return (previous.result as { resultId: string }).resultId;
  }
  const [inserted] = await tx
    .insert(inventoryOperations)
    .values({ requestId, actorId: actor.id, kind, fingerprint: hash, resultId })
    .onConflictDoNothing()
    .returning({ requestId: inventoryOperations.requestId });
  if (inserted) return null;
  const [previous] = await tx
    .select()
    .from(inventoryOperations)
    .where(eq(inventoryOperations.requestId, requestId));
  if (
    !previous ||
    previous.actorId !== actor.id ||
    previous.kind !== kind ||
    previous.fingerprint !== hash
  )
    conflict("Esta clave ya se usó para otra operación.");
  return previous.resultId;
}
export async function audit(
  tx: Tx,
  actor: Actor,
  entity: string,
  recordId: string,
  action: string,
  after: unknown,
) {
  await tx
    .insert(auditEvents)
    .values({ actorId: actor.id, entity, recordId, action, after });
}
export async function actorName(tx: Tx, actor: Actor): Promise<string> {
  const result = await tx.execute(
    sql`select name from "user" where id = ${actor.id}`,
  );
  return (result.rows[0]?.name as string | undefined) ?? actor.id;
}
export async function lockItem(tx: Tx, id: string, active = false) {
  const [row] = await tx
    .select()
    .from(items)
    .where(eq(items.id, id))
    .for("update");
  if (!row) notFound();
  if (active && row.archivedAt)
    invalid("Elegí un insumo activo.", "ARCHIVED_REFERENCE", 409);
  await tx
    .insert(stockBalances)
    .values({ itemId: id, physicalQuantity: "0", stockValue: "0" })
    .onConflictDoNothing();
  const [balance] = await tx
    .select()
    .from(stockBalances)
    .where(eq(stockBalances.itemId, id))
    .for("update");
  return { row, balance };
}
export function nextBalance(
  oldQty: bigint,
  oldValue: bigint | null,
  delta: bigint,
  incomingValue: bigint | null,
) {
  const nextQty = oldQty + delta;
  if (nextQty < 0n)
    conflict("El stock cambió o la cantidad supera el remanente.");
  if (delta === 0n)
    return {
      nextQty,
      nextValue: oldValue,
      applied: 0n,
      unitCost: null as bigint | null,
    };
  if (delta > 0n) {
    const nextValue =
      oldQty === 0n
        ? incomingValue
        : oldValue === null || incomingValue === null
          ? null
          : oldValue + incomingValue;
    return {
      nextQty,
      nextValue,
      applied: incomingValue,
      unitCost:
        incomingValue === null
          ? null
          : roundedDivision(incomingValue * SCALE, delta),
    };
  }
  const applied =
    oldValue === null
      ? null
      : nextQty === 0n
        ? -oldValue
        : -roundedDivision(oldValue * -delta, oldQty);
  const nextValue =
    nextQty === 0n ? 0n : oldValue === null ? null : oldValue + applied!;
  return {
    nextQty,
    nextValue,
    applied,
    unitCost:
      oldValue === null ? null : roundedDivision(oldValue * SCALE, oldQty),
  };
}
export async function move(
  tx: Tx,
  actor: Actor,
  itemId: string,
  lotId: string,
  kind: MovementRow["kind"],
  delta: bigint,
  incomingValue: bigint | null,
  reason: string | null,
  referenceId: string,
  balance: typeof stockBalances.$inferSelect,
) {
  const result = nextBalance(
    integer(balance.physicalQuantity),
    balance.stockValue === null ? null : integer(balance.stockValue),
    delta,
    incomingValue,
  );
  for (const value of [result.nextValue, result.applied, result.unitCost])
    if (value !== null) safeScaled(value, 24);
  await tx
    .update(stockBalances)
    .set({
      physicalQuantity: safeQuantity(result.nextQty),
      stockValue: result.nextValue === null ? null : six(result.nextValue),
    })
    .where(eq(stockBalances.itemId, itemId));
  await tx.insert(inventoryMovements).values({
    itemId,
    lotId,
    kind,
    delta: six(delta),
    unitCost: result.unitCost === null ? null : six(result.unitCost),
    valueDelta: result.applied === null ? null : six(result.applied),
    reason,
    referenceId,
    actorId: actor.id,
    actorName: await actorName(tx, actor),
  });
  balance.physicalQuantity = safeQuantity(result.nextQty);
  balance.stockValue = result.nextValue === null ? null : six(result.nextValue);
  return result;
}
function summary(
  row: typeof purchaseReceipts.$inferSelect,
  lineCount: number,
): ReceiptSummary {
  const sameSupplier = row.shippingSupplierId === row.supplierId;
  const payable =
    row.totalAmount === null
      ? null
      : cents(
          integer(row.totalAmount) +
            (sameSupplier ? integer(row.shippingAmount) : 0n),
        );
  return {
    merchandiseAmount: row.totalAmount,
    outstandingAmount:
      row.totalAmount === null
        ? null
        : cents(
            integer(row.totalAmount) +
              integer(row.shippingAmount) -
              integer(row.paidAmount) -
              integer(row.shippingPaidAmount),
          ),
    landedAmount:
      row.totalAmount === null
        ? null
        : cents(integer(row.totalAmount) + integer(row.shippingAmount)),
    shippingAmount: row.shippingAmount,
    shippingSupplierId: row.shippingSupplierId,
    shippingSupplierName: row.shippingSupplierName,
    shippingAllocation: row.shippingAllocation,
    shippingPaidAmount: row.shippingPaidAmount,
    shippingBalanceDue: sameSupplier
      ? "0.00"
      : cents(integer(row.shippingAmount) - integer(row.shippingPaidAmount)),
    id: row.id,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    receivedOn: row.receivedOn,
    documentNumber: row.documentNumber,
    totalAmount: payable,
    paidAmount: row.paidAmount,
    balanceDue:
      payable === null
        ? null
        : cents(integer(payable) - integer(row.paidAmount)),
    lineCount,
    createdAt: iso(row.createdAt),
  };
}
async function detail(
  db: AppDb | Tx,
  id: string,
  branchId: string,
): Promise<ReceiptDetail> {
  const [row] = await db
    .select()
    .from(purchaseReceipts)
    .where(
      and(eq(purchaseReceipts.id, id), eq(purchaseReceipts.branchId, branchId)),
    );
  if (!row) notFound();
  const lines = await db
    .select()
    .from(purchaseReceiptLines)
    .where(eq(purchaseReceiptLines.receiptId, id))
    .orderBy(asc(purchaseReceiptLines.position));
  const hasPaymentSource = await purchasePaymentSourcesAvailable(db as Tx);
  const payments = await db
    .select({
      id: purchasePayments.id,
      target: purchasePayments.target,
      source: hasPaymentSource ? purchasePayments.source : sql<null>`null`,
      paymentMethodName: purchasePayments.paymentMethodName,
      amount: purchasePayments.amount,
      paidOn: purchasePayments.paidOn,
      reference: purchasePayments.reference,
      createdAt: purchasePayments.createdAt,
    })
    .from(purchasePayments)
    .where(eq(purchasePayments.receiptId, id))
    .orderBy(asc(purchasePayments.createdAt), asc(purchasePayments.id));
  const advanceApplications = await receiptAdvanceApplications(db as Tx, id);
  return {
    ...summary(row, lines.length),
    advanceApplications,
    advanceAppliedAmount: cents(
      advanceApplications.reduce((n, a) => n + integer(a.amount), 0n),
    ),
    notes: row.notes,
    lines: lines.map((l) => ({
      shippingAmount: l.shippingAmount,
      landedTotal:
        l.lineTotal === null
          ? null
          : cents(integer(l.lineTotal) + integer(l.shippingAmount)),
      id: l.id,
      itemId: l.itemId,
      itemName: l.itemName,
      baseUnit: l.baseUnit,
      presentationId: l.presentationId,
      presentationName: l.presentationName,
      conversionFactor: l.conversionFactor,
      quantity: l.quantity,
      baseQuantity: l.baseQuantity,
      unitPrice: l.unitPrice,
      discount: l.discount,
      lineTotal: l.lineTotal,
      lotId: l.lotId,
      lotCode: l.lotCode,
      expiresOn: l.expiresOn,
    })),
    payments: payments.map((p) => ({
      source: p.source,
      target: p.target,
      id: p.id,
      paymentMethodName: p.paymentMethodName,
      amount: p.amount,
      paidOn: p.paidOn,
      reference: p.reference,
      createdAt: iso(p.createdAt),
    })),
  };
}

export function createInventoryService(
  db: AppDb,
  clock: () => Date = () => new Date(),
) {
  return {
    async listReceipts(actor: Actor, search = "") {
      requireCatalogAccess(actor);
      const ctx = await requireOperationalContext(
        db,
        actor,
        actor.branchId ?? "",
      );
      if (ctx.role === "staff")
        invalid("Se requiere permiso de encargado.", "FORBIDDEN", 403);
      const query = searchTerm(search);
      const where = and(
        eq(purchaseReceipts.branchId, ctx.branchId),
        query
          ? sql`(${purchaseReceipts.documentNumber} ilike ${`%${query}%`} or ${purchaseReceipts.supplierName} ilike ${`%${query}%`})`
          : undefined,
      );
      const rows = await db
        .select()
        .from(purchaseReceipts)
        .where(where)
        .orderBy(desc(purchaseReceipts.createdAt), desc(purchaseReceipts.id))
        .limit(100);
      const [total] = await db
        .select({ value: count() })
        .from(purchaseReceipts)
        .where(where);
      const result = await Promise.all(
        rows.map(async (r) => {
          const [n] = await db
            .select({ value: count() })
            .from(purchaseReceiptLines)
            .where(eq(purchaseReceiptLines.receiptId, r.id));
          return summary(r, n.value);
        }),
      );
      return { rows: result, total: total.value };
    },
    async getReceipt(actor: Actor, id: string) {
      requireCatalogAccess(actor);
      const ctx = await requireOperationalContext(
        db,
        actor,
        actor.branchId ?? "",
      );
      if (ctx.role === "staff")
        invalid("Se requiere permiso de encargado.", "FORBIDDEN", 403);
      validId(id);
      return db.transaction((tx) => detail(tx, id, ctx.branchId), {
        isolationLevel: "repeatable read",
        accessMode: "read only",
      });
    },
    async receive(actor: Actor, raw: unknown): Promise<ReceiptDetail> {
      requireCatalogAccess(actor);
      const ctx = await requireOperationalContext(
        db,
        actor,
        actor.branchId ?? "",
      );
      if (ctx.role === "staff")
        invalid("Se requiere permiso de encargado.", "FORBIDDEN", 403);
      const input = parseReceive(raw);
      if (input.receivedOn > branchBusinessDate(clock(), ctx.timeZone))
        invalid("La recepción no puede tener fecha futura.");
      const hash = fingerprint("receive", input);
      return db.transaction(async (tx) => {
        const receiptId = randomUUID();
        const prior = await claim(
          tx,
          actor,
          "receive",
          input.requestId,
          hash,
          receiptId,
        );
        if (prior) return detail(tx, prior, ctx.branchId);
        const orderReference = await lockPurchaseReceipt(tx, ctx, input);
        // Lock presentations before their references, mirroring catalog edits.
        const presentationIds = [
          ...new Set(
            input.lines
              .map((l) => l.presentationId)
              .filter((id): id is string => !!id),
          ),
        ].sort();
        const presentations = new Map<
          string,
          typeof purchasePresentations.$inferSelect
        >();
        for (const id of presentationIds) {
          const [p] = await tx
            .select()
            .from(purchasePresentations)
            .where(eq(purchasePresentations.id, id))
            .for("update");
          if (!p) notFound();
          presentations.set(id, p);
        }
        const vendorRows = new Map<string, typeof suppliers.$inferSelect>();
        for (const id of [
          ...new Set([
            input.supplierId,
            ...(input.shipping ? [input.shipping.supplierId] : []),
          ]),
        ].sort()) {
          const [vendor] = await tx
            .select()
            .from(suppliers)
            .where(eq(suppliers.id, id))
            .for("update");
          if (!vendor) notFound();
          if (vendor.archivedAt)
            invalid(
              "Elegí un proveedor o transportista activo.",
              "ARCHIVED_REFERENCE",
              409,
            );
          vendorRows.set(id, vendor);
        }
        const supplier = vendorRows.get(input.supplierId)!;
        if (input.documentNumber) {
          const [duplicate] = await tx
            .select({ id: purchaseReceipts.id })
            .from(purchaseReceipts)
            .where(
              and(
                eq(purchaseReceipts.branchId, ctx.branchId),
                eq(purchaseReceipts.supplierId, input.supplierId),
                eq(purchaseReceipts.documentNumber, input.documentNumber),
              ),
            )
            .limit(1);
          if (duplicate)
            conflict("Este comprobante ya fue registrado para el proveedor.");
        }
        await lockStock(
          tx,
          ctx,
          input.lines.map((l) => ({
            itemId: l.itemId,
            locationId: input.locationId,
          })),
        );
        const locked = new Map<string, { row: typeof items.$inferSelect }>();
        for (const id of [
          ...new Set(input.lines.map((l) => l.itemId)),
        ].sort()) {
          const [row] = await tx.select().from(items).where(eq(items.id, id));
          if (!row.purchasable || row.class === "unclassified")
            invalid("Elegí artículos clasificados y habilitados para compras.");
          locked.set(id, { row });
        }
        const prepared = input.lines.map((line, position) => {
          const orderLine = line.orderLineId
            ? orderReference?.byId.get(line.orderLineId)
            : undefined;
          const currentItem = locked.get(line.itemId)!.row;
          if (
            orderLine &&
            (currentItem.baseUnit !== orderLine.baseUnit ||
              !currentItem.stockTracked)
          )
            conflict(
              "La unidad o modalidad de inventario del insumo no coincide con el pedido. Revisá su ficha antes de recibir.",
            );
          const p = line.presentationId
            ? presentations.get(line.presentationId)
            : null;
          if (
            !orderLine &&
            p &&
            (p.archivedAt ||
              p.supplierId !== input.supplierId ||
              p.itemId !== line.itemId)
          )
            invalid(
              "La presentación cambió o está archivada.",
              "ARCHIVED_REFERENCE",
              409,
            );
          if (
            !orderLine &&
            ((line.presentationRevision !== undefined &&
              (!p || p.revision !== line.presentationRevision)) ||
              (line.itemRevision !== undefined &&
                locked.get(line.itemId)!.row.revision !== line.itemRevision))
          )
            conflict("El catálogo cambió; revisá la recepción.");
          const factor = orderLine
            ? integer(orderLine.conversionFactor)
            : p
              ? integer(p.baseQuantity)
              : SCALE;
          const baseQty = exactDivision(
            integer(line.quantity!) * factor,
            SCALE,
          );
          safeQuantity(baseQty);
          if (baseQty === 0n) invalid("Cantidad demasiado pequeña.");
          const grossCents =
            line.unitPrice === null
              ? null
              : roundedDivision(
                  integer(line.quantity!) * integer(line.unitPrice!),
                  10n ** 10n,
                );
          const discount = integer(line.discount);
          if (
            (grossCents === null && discount !== 0n) ||
            (grossCents !== null && discount > grossCents)
          )
            invalid("Revisá el descuento del renglón.");
          const net = grossCents === null ? null : grossCents - discount;
          if (net !== null) safeScaled(net, 18);
          return { line, p, factor, baseQty, net, position, orderLine };
        });
        const total = prepared.some((p) => p.net === null)
          ? null
          : prepared.reduce((n, p) => n + p.net!, 0n);
        if (total !== null) safeScaled(total, 18);
        const shipping = input.shipping;
        if (
          shipping &&
          (shipping.allocation === "manual") !== !!shipping.amounts
        )
          invalid("Revisá el método de reparto del envío.");
        const freight = shipping ? integer(shipping.amount!) : 0n;
        const allocations = allocateShipping(
          freight,
          prepared.map((p) => p.net),
          shipping?.amounts?.map((a) => integer(a!)),
        );
        if (total !== null) safeScaled(total + freight, 18);
        const [r] = await tx
          .insert(purchaseReceipts)
          .values({
            id: receiptId,
            branchId: ctx.branchId,
            supplierId: input.supplierId,
            supplierName: supplier.name,
            receivedOn: input.receivedOn,
            documentNumber: input.documentNumber,
            notes: input.notes,
            totalAmount: total === null ? null : cents(total),
            shippingAmount: cents(freight),
            shippingSupplierId: shipping?.supplierId ?? null,
            shippingSupplierName: shipping
              ? vendorRows.get(shipping.supplierId)!.name
              : null,
            shippingAllocation: shipping?.allocation ?? "value",
            actorId: actor.id,
          })
          .returning();
        const [document] = await tx
          .insert(stockDocuments)
          .values({ branchId: ctx.branchId, kind: "receipt", receiptId: r.id })
          .returning();
        const orderReceived: {
          orderLineId: string;
          receiptLineId: string;
          quantity: string;
        }[] = [];
        for (const {
          line,
          p,
          factor,
          baseQty,
          net,
          position,
          orderLine,
        } of prepared) {
          const lockedItem = locked.get(line.itemId)!;
          const [lot] = await tx
            .insert(inventoryLots)
            .values({
              itemId: line.itemId,
              receiptId: r.id,
              receivedOn: input.receivedOn,
              expiresOn: line.expiresOn,
              lotCode: line.lotCode,
              initialQuantity: six(baseQty),
              remainingQuantity: six(baseQty),
            })
            .returning();
          const [receiptLine] = await tx
            .insert(purchaseReceiptLines)
            .values({
              position,
              receiptId: r.id,
              itemId: line.itemId,
              itemName: orderLine?.itemName ?? lockedItem.row.name,
              baseUnit: orderLine?.baseUnit ?? lockedItem.row.baseUnit,
              presentationId: p?.id ?? null,
              presentationName: orderLine?.presentationName ?? p?.name ?? null,
              conversionFactor: six(factor),
              quantity: line.quantity!,
              baseQuantity: six(baseQty),
              unitPrice: line.unitPrice,
              discount: line.discount,
              lineTotal: net === null ? null : cents(net),
              shippingAmount: cents(allocations[position]),
              lotId: lot.id,
              lotCode: line.lotCode,
              expiresOn: line.expiresOn,
            })
            .returning();
          if (orderLine)
            orderReceived.push({
              orderLineId: orderLine.id,
              receiptLineId: receiptLine.id,
              quantity: six(baseQty),
            });
          await postMovement(tx, ctx, {
            operationId: input.requestId,
            documentId: document.id,
            action: "receipt",
            reason: null,
            legs: [
              {
                itemId: line.itemId,
                lotId: lot.id,
                locationId: input.locationId,
                quantity: six(baseQty),
                direction: "in",
                incomingValue:
                  net === null
                    ? null
                    : six((net + allocations[position]) * 10000n),
              },
            ],
          });
        }
        await finishPurchaseReceipt(tx, ctx, orderReference, orderReceived);
        if (orderReference)
          await applyPurchaseAdvances(tx, ctx, r.id, orderReference.order.id);
        await audit(tx, actor, "purchase_receipts", r.id, "receive", {
          purchaseOrderId: input.purchaseOrderId ?? null,
          totalAmount: total === null ? null : cents(total),
          shippingAmount: cents(freight),
          shippingSupplierId: shipping?.supplierId ?? null,
          shippingAllocation: shipping?.allocation ?? "value",
          shippingAmounts: allocations.map(cents),
          lineCount: prepared.length,
        });
        return detail(tx, r.id, ctx.branchId);
      });
    },
    async pay(
      actor: Actor,
      receiptId: string,
      raw: unknown,
    ): Promise<ReceiptDetail> {
      requireCatalogAccess(actor);
      const ctx = await requireOperationalContext(
        db,
        actor,
        actor.branchId ?? "",
      );
      if (ctx.role === "staff")
        invalid("Se requiere permiso de encargado.", "FORBIDDEN", 403);
      validId(receiptId);
      const input = parsePayment(raw);
      if (input.paidOn > branchBusinessDate(clock(), ctx.timeZone))
        invalid("El pago no puede tener fecha futura.");
      const hash = fingerprint("pay", { receiptId, ...input });
      return db.transaction(async (tx) => {
        const paymentId = randomUUID();
        const prior = await claim(
          tx,
          actor,
          "pay",
          input.requestId,
          hash,
          paymentId,
        );
        if (prior) return detail(tx, receiptId, ctx.branchId);
        // Resolve an omitted origin before taking any document/method locks.
        const [previewMethod] = await tx
          .select()
          .from(paymentMethods)
          .where(eq(paymentMethods.id, input.paymentMethodId));
        if (!previewMethod) notFound();
        const source =
          input.source ?? (previewMethod.kind === "cash" ? "cash" : "external");
        const hasPaymentSource = await purchasePaymentSourcesAvailable(tx);
        if (source === "cash") await lockCashSession(tx, ctx);
        // Match receipt and advance registration: order before receipt.
        const [allocation] = await tx
          .select({ orderId: purchaseOrderReceipts.orderId })
          .from(purchaseOrderReceipts)
          .innerJoin(
            purchaseReceiptLines,
            eq(purchaseReceiptLines.id, purchaseOrderReceipts.receiptLineId),
          )
          .where(eq(purchaseReceiptLines.receiptId, receiptId))
          .limit(1);
        if (allocation) {
          const [order] = await tx
            .select()
            .from(purchaseOrders)
            .where(
              and(
                eq(purchaseOrders.id, allocation.orderId),
                eq(purchaseOrders.branchId, ctx.branchId),
              ),
            )
            .for("update");
          if (!order) notFound();
          await applyPurchaseAdvances(tx, ctx, receiptId, order.id);
        }
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
        if (!receipt) notFound();
        const [method] = await tx
          .select()
          .from(paymentMethods)
          .where(eq(paymentMethods.id, input.paymentMethodId))
          .for("update");
        if (!method) notFound();
        if (method.archivedAt)
          invalid("Elegí un medio de pago activo.", "ARCHIVED_REFERENCE", 409);
        if (method.kind !== previewMethod.kind)
          conflict("El medio de pago cambió. Revisá el origen del dinero.");
        if (source === "cash" && method.kind !== "cash")
          invalid("Una salida del cajón requiere el medio Efectivo.");
        const shippingPayment = input.target === "shipping";
        if (
          shippingPayment &&
          (!receipt.shippingSupplierId ||
            receipt.shippingSupplierId === receipt.supplierId)
        )
          conflict("El envío se paga junto con el proveedor de mercadería.");
        const payable = shippingPayment
          ? receipt.shippingAmount
          : summary(receipt, 0).totalAmount;
        if (payable === null)
          conflict(
            "El total está pendiente; completá el costo antes de pagar.",
          );
        const newPaid =
          integer(
            shippingPayment ? receipt.shippingPaidAmount : receipt.paidAmount,
          ) + integer(input.amount!);
        if (newPaid > integer(payable!))
          conflict("El pago supera el saldo pendiente.");
        const payment = {
          id: paymentId,
          receiptId,
          paymentMethodId: method.id,
          paymentMethodName: method.name,
          target: shippingPayment ? "shipping" : "supplier",
          source,
          amount: input.amount!,
          paidOn: input.paidOn,
          reference: input.reference,
          actorId: actor.id,
        };
        if (hasPaymentSource) await tx.insert(purchasePayments).values(payment);
        else {
          // Drizzle includes omitted columns with DEFAULT; use an explicit legacy
          // column list until the reviewed migration has actually been applied.
          await tx.execute(
            sql`insert into ${purchasePayments} (id,receipt_id,payment_method_id,payment_method_name,target,amount,paid_on,reference,actor_id) values (${payment.id},${payment.receiptId},${payment.paymentMethodId},${payment.paymentMethodName},${payment.target},${payment.amount},${payment.paidOn},${payment.reference},${payment.actorId})`,
          );
        }
        await tx
          .update(purchaseReceipts)
          .set(
            shippingPayment
              ? { shippingPaidAmount: cents(newPaid) }
              : { paidAmount: cents(newPaid) },
          )
          .where(
            and(
              eq(purchaseReceipts.id, receiptId),
              eq(purchaseReceipts.branchId, ctx.branchId),
            ),
          );
        if (source === "cash")
          await recordCashMovement(tx, ctx, {
            kind: "supplier",
            amount: cents(-integer(payment.amount)),
            sourceType: "purchase-payment",
            sourceId: payment.id,
            methodKind: "cash",
            methodName: method.name,
            concept: `Pago a ${shippingPayment ? receipt.shippingSupplierName : receipt.supplierName}`,
            reference: payment.reference,
          });
        await audit(tx, actor, "purchase_payments", payment.id, "pay", {
          receiptId,
          amount: payment.amount,
          target: payment.target,
          source,
        });
        return detail(tx, receiptId, ctx.branchId);
      });
    },
    async getStock(actor: Actor, search = ""): Promise<StockResult> {
      requireCatalogAccess(actor);
      const ctx = await requireOperationalContext(
        db,
        actor,
        actor.branchId ?? "",
      );
      return stockByBranch(db, ctx, search, clock());
    },
    async getLots(actor: Actor, itemId: string, offset = 0) {
      requireCatalogAccess(actor);
      const ctx = await requireOperationalContext(
        db,
        actor,
        actor.branchId ?? "",
      );
      validId(itemId);
      page(offset);
      return lotsByBranch(db, ctx, itemId, offset, clock());
    },
    async getMovements(
      actor: Actor,
      itemId: string,
      offset = 0,
    ): Promise<{ rows: MovementRow[]; total: number }> {
      requireCatalogAccess(actor);
      const ctx = await requireOperationalContext(
        db,
        actor,
        actor.branchId ?? "",
      );
      validId(itemId);
      page(offset);
      return movementsByBranch(db, ctx, itemId, offset);
    },
    async adjust(actor: Actor, raw: unknown): Promise<{ lot: LotRow }> {
      requireCatalogAccess(actor);
      return adjustAt(db, actor, raw, clock());
    },
  };
}
