import { createHash, randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, ilike, sql } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";
import { requireCatalogAccess } from "@/lib/access";
import { AppError } from "@/lib/errors";
import {
  auditEvents,
  ingredients,
  paymentMethods,
  purchasePresentations,
  suppliers,
} from "@/db/business-schema";
import {
  inventoryLots,
  inventoryLotEvents,
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
import { parseAdjustment, parsePayment, parseReceive } from "./validation";
import type {
  LotRow,
  MovementRow,
  ReceiptDetail,
  ReceiptSummary,
  StockResult,
} from "./types";

export type Tx = Parameters<Parameters<AppDb["transaction"]>[0]>[0];
export const invalid = (message: string, code = "VALIDATION", status = 400): never => {
  throw new AppError(code, message, status);
};
export const notFound = (): never =>
  invalid("No se encontró el registro.", "NOT_FOUND", 404);
export const conflict = (message: string): never => invalid(message, "CONFLICT", 409);
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
): Promise<string | null> {
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
export async function lockIngredient(tx: Tx, id: string, active = false) {
  const [row] = await tx
    .select()
    .from(ingredients)
    .where(eq(ingredients.id, id))
    .for("update");
  if (!row) notFound();
  if (active && row.archivedAt)
    invalid("Elegí un insumo activo.", "ARCHIVED_REFERENCE", 409);
  await tx
    .insert(stockBalances)
    .values({ ingredientId: id, physicalQuantity: "0", stockValue: "0" })
    .onConflictDoNothing();
  const [balance] = await tx
    .select()
    .from(stockBalances)
    .where(eq(stockBalances.ingredientId, id))
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
  ingredientId: string,
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
    .where(eq(stockBalances.ingredientId, ingredientId));
  await tx
    .insert(inventoryMovements)
    .values({
      ingredientId,
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
  return {
    id: row.id,
    supplierId: row.supplierId,
    supplierName: row.supplierName,
    receivedOn: row.receivedOn,
    documentNumber: row.documentNumber,
    totalAmount: row.totalAmount,
    paidAmount: row.paidAmount,
    balanceDue:
      row.totalAmount === null
        ? null
        : cents(integer(row.totalAmount) - integer(row.paidAmount)),
    lineCount,
    createdAt: iso(row.createdAt),
  };
}
async function detail(db: AppDb | Tx, id: string): Promise<ReceiptDetail> {
  const [row] = await db
    .select()
    .from(purchaseReceipts)
    .where(eq(purchaseReceipts.id, id));
  if (!row) notFound();
  const lines = await db
    .select()
    .from(purchaseReceiptLines)
    .where(eq(purchaseReceiptLines.receiptId, id))
    .orderBy(asc(purchaseReceiptLines.position));
  const payments = await db
    .select()
    .from(purchasePayments)
    .where(eq(purchasePayments.receiptId, id))
    .orderBy(asc(purchasePayments.createdAt), asc(purchasePayments.id));
  return {
    ...summary(row, lines.length),
    notes: row.notes,
    lines: lines.map((l) => ({
      id: l.id,
      ingredientId: l.ingredientId,
      ingredientName: l.ingredientName,
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
      id: p.id,
      paymentMethodName: p.paymentMethodName,
      amount: p.amount,
      paidOn: p.paidOn,
      reference: p.reference,
      createdAt: iso(p.createdAt),
    })),
  };
}
async function lotRow(
  db: AppDb | Tx,
  id: string,
  today: string,
): Promise<LotRow> {
  const [found] = await db
    .select({ lot: inventoryLots, ingredient: ingredients })
    .from(inventoryLots)
    .innerJoin(ingredients, eq(inventoryLots.ingredientId, ingredients.id))
    .where(eq(inventoryLots.id, id));
  if (!found) notFound();
  const { lot, ingredient } = found;
  return {
    id: lot.id,
    ingredientId: lot.ingredientId,
    ingredientName: ingredient.name,
    baseUnit: ingredient.baseUnit,
    receiptId: lot.receiptId,
    receivedOn: lot.receivedOn,
    expiresOn: lot.expiresOn,
    lotCode: lot.lotCode,
    initialQuantity: lot.initialQuantity,
    remainingQuantity: lot.remainingQuantity,
    blocked: lot.blocked,
    expired: lot.expiresOn !== null && lot.expiresOn <= today,
    revision: lot.revision,
    createdAt: iso(lot.createdAt),
  };
}
export function createInventoryService(
  db: AppDb,
  clock: () => Date = () => new Date(),
) {
  return {
    async listReceipts(actor: Actor, search = "") {
      requireCatalogAccess(actor);
      const query = searchTerm(search);
      const where = query
        ? sql`(${purchaseReceipts.documentNumber} ilike ${`%${query}%`} or ${purchaseReceipts.supplierName} ilike ${`%${query}%`})`
        : undefined;
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
      validId(id);
      return db.transaction((tx) => detail(tx, id), {
        isolationLevel: "repeatable read",
        accessMode: "read only",
      });
    },
    async receive(actor: Actor, raw: unknown): Promise<ReceiptDetail> {
      requireCatalogAccess(actor);
      const input = parseReceive(raw);
      if (input.receivedOn > businessDate(clock()))
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
        if (prior) return detail(tx, prior);
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
        const [supplier] = await tx
          .select()
          .from(suppliers)
          .where(eq(suppliers.id, input.supplierId))
          .for("update");
        if (!supplier) notFound();
        if (supplier.archivedAt)
          invalid("Elegí un proveedor activo.", "ARCHIVED_REFERENCE", 409);
        if (input.documentNumber) {
          const [duplicate] = await tx
            .select({ id: purchaseReceipts.id })
            .from(purchaseReceipts)
            .where(
              and(
                eq(purchaseReceipts.supplierId, input.supplierId),
                eq(purchaseReceipts.documentNumber, input.documentNumber),
              ),
            )
            .limit(1);
          if (duplicate)
            conflict("Este comprobante ya fue registrado para el proveedor.");
        }
        const locked = new Map<
          string,
          Awaited<ReturnType<typeof lockIngredient>>
        >();
        for (const id of [
          ...new Set(input.lines.map((l) => l.ingredientId)),
        ].sort())
          locked.set(id, await lockIngredient(tx, id, true));
        const prepared = input.lines.map((line, position) => {
          const p = line.presentationId
            ? presentations.get(line.presentationId)
            : null;
          if (
            p &&
            (p.archivedAt ||
              p.supplierId !== input.supplierId ||
              p.ingredientId !== line.ingredientId)
          )
            invalid(
              "La presentación cambió o está archivada.",
              "ARCHIVED_REFERENCE",
              409,
            );
          if (
            (line.presentationRevision !== undefined &&
              (!p || p.revision !== line.presentationRevision)) ||
            (line.ingredientRevision !== undefined &&
              locked.get(line.ingredientId)!.row.revision !==
                line.ingredientRevision)
          )
            conflict("El catálogo cambió; revisá la recepción.");
          const factor = p ? integer(p.baseQuantity) : SCALE;
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
          return { line, p, factor, baseQty, net, position };
        });
        const total = prepared.some((p) => p.net === null)
          ? null
          : prepared.reduce((n, p) => n + p.net!, 0n);
        if (total !== null) safeScaled(total, 18);
        const [r] = await tx
          .insert(purchaseReceipts)
          .values({
            id: receiptId,
            supplierId: input.supplierId,
            supplierName: supplier.name,
            receivedOn: input.receivedOn,
            documentNumber: input.documentNumber,
            notes: input.notes,
            totalAmount: total === null ? null : cents(total),
            actorId: actor.id,
          })
          .returning();
        for (const { line, p, factor, baseQty, net, position } of prepared) {
          const lockedIngredient = locked.get(line.ingredientId)!;
          const [lot] = await tx
            .insert(inventoryLots)
            .values({
              ingredientId: line.ingredientId,
              receiptId: r.id,
              receivedOn: input.receivedOn,
              expiresOn: line.expiresOn,
              lotCode: line.lotCode,
              initialQuantity: six(baseQty),
              remainingQuantity: six(baseQty),
            })
            .returning();
          await tx
            .insert(purchaseReceiptLines)
            .values({
              position,
              receiptId: r.id,
              ingredientId: line.ingredientId,
              ingredientName: lockedIngredient.row.name,
              baseUnit: lockedIngredient.row.baseUnit,
              presentationId: p?.id ?? null,
              presentationName: p?.name ?? null,
              conversionFactor: six(factor),
              quantity: line.quantity!,
              baseQuantity: six(baseQty),
              unitPrice: line.unitPrice,
              discount: line.discount,
              lineTotal: net === null ? null : cents(net),
              lotId: lot.id,
              lotCode: line.lotCode,
              expiresOn: line.expiresOn,
            });
          await move(
            tx,
            actor,
            line.ingredientId,
            lot.id,
            "receipt",
            baseQty,
            net === null ? null : net * 10000n,
            null,
            r.id,
            lockedIngredient.balance,
          );
        }
        await audit(tx, actor, "purchase_receipts", r.id, "receive", {
          totalAmount: total === null ? null : cents(total),
          lineCount: prepared.length,
        });
        return detail(tx, r.id);
      });
    },
    async pay(
      actor: Actor,
      receiptId: string,
      raw: unknown,
    ): Promise<ReceiptDetail> {
      requireCatalogAccess(actor);
      validId(receiptId);
      const input = parsePayment(raw);
      if (input.paidOn > businessDate(clock()))
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
        if (prior) return detail(tx, receiptId);
        const [receipt] = await tx
          .select()
          .from(purchaseReceipts)
          .where(eq(purchaseReceipts.id, receiptId))
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
        if (receipt.totalAmount === null)
          conflict(
            "El total está pendiente; completá el costo antes de pagar.",
          );
        const newPaid = integer(receipt.paidAmount) + integer(input.amount!);
        if (newPaid > integer(receipt.totalAmount!))
          conflict("El pago supera el saldo pendiente.");
        const [payment] = await tx
          .insert(purchasePayments)
          .values({
            id: paymentId,
            receiptId,
            paymentMethodId: method.id,
            paymentMethodName: method.name,
            amount: input.amount!,
            paidOn: input.paidOn,
            reference: input.reference,
            actorId: actor.id,
          })
          .returning();
        await tx
          .update(purchaseReceipts)
          .set({ paidAmount: cents(newPaid) })
          .where(eq(purchaseReceipts.id, receiptId));
        await audit(tx, actor, "purchase_payments", payment.id, "pay", {
          receiptId,
          amount: payment.amount,
        });
        return detail(tx, receiptId);
      });
    },
    async getStock(actor: Actor, search = ""): Promise<StockResult> {
      requireCatalogAccess(actor);
      return db.transaction(
        async (snapshot) => {
          const today = businessDate(clock());
          const query = searchTerm(search);
          const where = query
            ? ilike(ingredients.name, `%${query}%`)
            : undefined;
          const rows = await snapshot
            .select({ ingredient: ingredients, balance: stockBalances })
            .from(ingredients)
            .innerJoin(
              stockBalances,
              eq(ingredients.id, stockBalances.ingredientId),
            )
            .where(where)
            .orderBy(asc(ingredients.name), asc(ingredients.id))
            .limit(100);
          const [n] = await snapshot
            .select({ value: count() })
            .from(ingredients)
            .innerJoin(
              stockBalances,
              eq(ingredients.id, stockBalances.ingredientId),
            )
            .where(where);
          const result = await Promise.all(
            rows.map(async ({ ingredient: i, balance: b }) => {
              const lots = await snapshot
                .select()
                .from(inventoryLots)
                .where(eq(inventoryLots.ingredientId, i.id));
              const total = lots.reduce(
                (v, l) => v + integer(l.remainingQuantity),
                0n,
              );
              const expired = lots.reduce(
                (v, l) =>
                  v +
                  (l.expiresOn !== null && l.expiresOn <= today
                    ? integer(l.remainingQuantity)
                    : 0n),
                0n,
              );
              const blocked = lots.reduce(
                (v, l) => v + (l.blocked ? integer(l.remainingQuantity) : 0n),
                0n,
              );
              const undated = lots.reduce(
                (v, l) =>
                  v +
                  (l.expiresOn === null ? integer(l.remainingQuantity) : 0n),
                0n,
              );
              const usable = lots.reduce(
                (v, l) =>
                  v +
                  (!l.blocked && (l.expiresOn === null || l.expiresOn > today)
                    ? integer(l.remainingQuantity)
                    : 0n),
                0n,
              );
              return {
                ingredientId: i.id,
                name: i.name,
                baseUnit: i.baseUnit,
                archived: i.archivedAt !== null,
                physicalQuantity: six(total),
                usableQuantity: six(usable),
                expiredQuantity: six(expired),
                blockedQuantity: six(blocked),
                undatedQuantity: six(undated),
                stockValue: b.stockValue,
                averageCost:
                  b.stockValue === null || integer(b.physicalQuantity) === 0n
                    ? null
                    : six(
                        roundedDivision(
                          integer(b.stockValue) * SCALE,
                          integer(b.physicalQuantity),
                        ),
                      ),
              };
            }),
          );
          return {
            rows: result,
            total: n.value,
            asOf: iso(clock()),
            businessDate: today,
          };
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
    async getLots(actor: Actor, ingredientId: string, offset = 0) {
      requireCatalogAccess(actor);
      validId(ingredientId);
      page(offset);
      const [i] = await db
        .select({ id: ingredients.id })
        .from(ingredients)
        .where(eq(ingredients.id, ingredientId));
      if (!i) notFound();
      const rows = await db
        .select({ id: inventoryLots.id })
        .from(inventoryLots)
        .where(eq(inventoryLots.ingredientId, ingredientId))
        .orderBy(
          sql`case when ${inventoryLots.remainingQuantity} > 0 then 0 else 1 end`,
          asc(inventoryLots.expiresOn),
          asc(inventoryLots.receivedOn),
          asc(inventoryLots.id),
        )
        .limit(100)
        .offset(offset);
      const [n] = await db
        .select({ value: count() })
        .from(inventoryLots)
        .where(eq(inventoryLots.ingredientId, ingredientId));
      return {
        rows: await Promise.all(
          rows.map((r) => lotRow(db, r.id, businessDate(clock()))),
        ),
        total: n.value,
      };
    },
    async getMovements(
      actor: Actor,
      ingredientId: string,
      offset = 0,
    ): Promise<{ rows: MovementRow[]; total: number }> {
      requireCatalogAccess(actor);
      validId(ingredientId);
      page(offset);
      const [i] = await db
        .select({ id: ingredients.id })
        .from(ingredients)
        .where(eq(ingredients.id, ingredientId));
      if (!i) notFound();
      const rows = await db
        .select()
        .from(inventoryMovements)
        .where(eq(inventoryMovements.ingredientId, ingredientId))
        .orderBy(
          desc(inventoryMovements.createdAt),
          desc(inventoryMovements.id),
        )
        .limit(100)
        .offset(offset);
      const [n] = await db
        .select({ value: count() })
        .from(inventoryMovements)
        .where(eq(inventoryMovements.ingredientId, ingredientId));
      return {
        rows: rows.map((m) => ({
          id: m.id,
          lotId: m.lotId,
          ingredientId: m.ingredientId,
          kind: m.kind as MovementRow["kind"],
          delta: m.delta,
          unitCost: m.unitCost,
          valueDelta: m.valueDelta,
          reason: m.reason,
          referenceId: m.referenceId,
          actorName: m.actorName,
          createdAt: iso(m.createdAt),
        })),
        total: n.value,
      };
    },
    async adjust(actor: Actor, raw: unknown): Promise<{ lot: LotRow }> {
      requireCatalogAccess(actor);
      const input = parseAdjustment(raw);
      if (input.kind === "opening" && input.receivedOn > businessDate(clock()))
        invalid("El ingreso no puede tener fecha futura.");
      const hash = fingerprint("adjust", input);
      return db.transaction(async (tx) => {
        const resultId = input.kind === "opening" ? randomUUID() : input.lotId;
        const prior = await claim(
          tx,
          actor,
          "adjust",
          input.requestId,
          hash,
          resultId,
        );
        if (prior)
          return { lot: await lotRow(tx, prior, businessDate(clock())) };
        const opening = input.kind === "opening";
        const ingredientId = opening
          ? input.ingredientId
          : (
              await tx
                .select({ ingredientId: inventoryLots.ingredientId })
                .from(inventoryLots)
                .where(eq(inventoryLots.id, input.lotId))
            )[0]?.ingredientId;
        if (!ingredientId) notFound();
        const locked = await lockIngredient(tx, ingredientId, opening);
        let lot: typeof inventoryLots.$inferSelect;
        let delta: bigint;
        let incoming: bigint | null = null;
        if (opening) {
          delta = integer(input.quantity!);
          incoming =
            input.unitCost === null
              ? null
              : roundedDivision(delta * integer(input.unitCost), SCALE);
          [lot] = await tx
            .insert(inventoryLots)
            .values({
              id: resultId,
              ingredientId,
              receivedOn: input.receivedOn,
              expiresOn: input.expiresOn,
              lotCode: input.lotCode,
              initialQuantity: input.quantity!,
              remainingQuantity: input.quantity!,
            })
            .returning();
        } else {
          const [found] = await tx
            .select()
            .from(inventoryLots)
            .where(eq(inventoryLots.id, input.lotId))
            .for("update");
          if (!found || found.ingredientId !== ingredientId) notFound();
          if (found.revision !== input.revision)
            conflict("El lote cambió; recargá sus datos.");
          lot = found;
          const remaining = integer(lot.remainingQuantity);
          if (input.kind === "block") {
            if (lot.blocked === input.blocked)
              conflict("El estado del lote ya cambió.");
            await tx
              .update(inventoryLots)
              .set({ blocked: input.blocked, revision: lot.revision + 1 })
              .where(eq(inventoryLots.id, lot.id));
            await tx
              .insert(inventoryLotEvents)
              .values({
                lotId: lot.id,
                blocked: input.blocked,
                reason: input.reason,
                actorId: actor.id,
              });
            await audit(tx, actor, "inventory_lots", lot.id, "block", {
              blocked: input.blocked,
              reason: input.reason,
            });
            return { lot: await lotRow(tx, lot.id, businessDate(clock())) };
          }
          delta =
            input.kind === "waste"
              ? -integer(input.quantity!)
              : integer(input.countedQuantity!) - remaining;
          if (input.kind === "count" && delta === 0n)
            conflict("El conteo no cambió la cantidad.");
          if (delta < -remaining)
            conflict("La salida supera el remanente del lote.");
          if (delta > 0n && locked.row.archivedAt)
            invalid(
              "Elegí un insumo activo para ingresar stock.",
              "ARCHIVED_REFERENCE",
              409,
            );
          if (delta > 0n) {
            const qty = integer(locked.balance.physicalQuantity);
            const value = locked.balance.stockValue;
            const [firstMovement] = await tx
              .select({ valueDelta: inventoryMovements.valueDelta })
              .from(inventoryMovements)
              .where(eq(inventoryMovements.lotId, lot.id))
              .orderBy(
                asc(inventoryMovements.createdAt),
                asc(inventoryMovements.id),
              )
              .limit(1);
            incoming =
              qty === 0n ||
              value === null ||
              !firstMovement ||
              firstMovement.valueDelta === null
                ? null
                : roundedDivision(integer(value) * delta, qty);
          }
          await tx
            .update(inventoryLots)
            .set({
              remainingQuantity: safeQuantity(remaining + delta),
              revision: lot.revision + 1,
            })
            .where(eq(inventoryLots.id, lot.id));
        }
        await move(
          tx,
          actor,
          ingredientId,
          lot.id,
          opening ? "opening" : input.kind === "waste" ? "waste" : "count",
          delta,
          incoming,
          input.reason,
          lot.id,
          locked.balance,
        );
        await audit(
          tx,
          actor,
          "inventory_lots",
          lot.id,
          opening ? "opening" : input.kind,
          { delta: six(delta), reason: input.reason },
        );
        return { lot: await lotRow(tx, lot.id, businessDate(clock())) };
      });
    },
  };
}
