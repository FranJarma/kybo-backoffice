import { AppError } from "@/lib/errors";
import type { CashPosnetInput, CashPosnetClose, CashTotals } from "./types";
export function cashCents(input: string, signed = false): bigint {
  if (
    typeof input !== "string" ||
    !(signed ? /^-?\d{1,12}(?:\.\d{1,2})?$/ : /^\d{1,12}(?:\.\d{1,2})?$/).test(
      input,
    )
  )
    throw new AppError("VALIDATION", "Revisá el importe ingresado.", 400);
  const negative = input.startsWith("-");
  const [whole, fraction = ""] = input.replace("-", "").split(".");
  const value = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return negative ? -value : value;
}
export function cashAmount(value: bigint) {
  if (value <= -(10n ** 14n) || value >= 10n ** 14n)
    throw new AppError(
      "VALIDATION",
      "El importe excede el límite permitido.",
      400,
    );
  const negative = value < 0n;
  const digits = (negative ? -value : value).toString().padStart(3, "0");
  return `${negative ? "-" : ""}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}
export function summarizeCash(
  rows: { kind: string; amount: string; methodKind: string }[],
): CashTotals {
  const result = {
    expectedCash: 0n,
    opening: 0n,
    cashCollections: 0n,
    cashRefunds: 0n,
    expenses: 0n,
    supplierPayments: 0n,
    withdrawals: 0n,
    cardTotal: 0n,
    transferTotal: 0n,
    otherTotal: 0n,
  };
  let cardOperations = 0;
  for (const row of rows) {
    const amount = cashCents(row.amount, true);
    if (row.methodKind === "cash") {
      result.expectedCash += amount;
      if (row.kind === "opening") result.opening += amount;
      if (row.kind === "collection") result.cashCollections += amount;
      if (row.kind === "refund") result.cashRefunds += amount;
      if (row.kind === "expense") result.expenses += amount;
      if (["supplier", "advance"].includes(row.kind))
        result.supplierPayments += amount;
      if (row.kind === "withdrawal") result.withdrawals += amount;
    } else if (row.methodKind === "card") {
      result.cardTotal += amount;
      cardOperations++;
    } else if (row.methodKind === "transfer") result.transferTotal += amount;
    else result.otherTotal += amount;
  }
  return {
    ...Object.fromEntries(
      Object.entries(result).map(([key, value]) => [key, cashAmount(value)]),
    ),
    cardOperations,
  } as CashTotals;
}
export function calculateCashClose(
  expected: string,
  counted: string,
  withdrawal: string,
) {
  const E = cashCents(expected, true),
    C = cashCents(counted),
    R = cashCents(withdrawal);
  if (R > C)
    throw new AppError(
      "VALIDATION",
      "El retiro supera el efectivo contado.",
      400,
    );
  return { difference: cashAmount(C - E), fund: cashAmount(C - R) };
}
export function reconcilePosnet(
  input: CashPosnetInput,
  expected: string,
  expectedOperations: number,
): CashPosnetClose {
  const fail = (message: string): never => {
    throw new AppError("VALIDATION", message, 400);
  };
  if (input.mode === "none") {
    if (
      cashCents(expected, true) !== 0n ||
      expectedOperations !== 0 ||
      input.lots.length
    )
      fail("Registrá los lotes o indicá por qué quedaron pendientes.");
    return {
      ...input,
      expected,
      expectedOperations,
      total: "0.00",
      operations: 0,
      difference: "0.00",
      needsReview: false,
    };
  }
  if (input.mode === "pending") {
    if (!input.reason?.trim() || input.lots.length)
      fail("Indicá el motivo del lote pendiente.");
    return {
      ...input,
      expected,
      expectedOperations,
      total: null,
      operations: null,
      difference: null,
      needsReview: true,
    };
  }
  if (!input.lots.length || input.lots.length > 20)
    fail("Agregá entre uno y veinte lotes.");
  const numbers = new Set<string>(),
    photos = new Set<string>();
  let total = 0n,
    operations = 0;
  for (const lot of input.lots) {
    const number = lot.number.trim().toUpperCase();
    if (!number || numbers.has(number))
      fail(
        "Revisá los números de lote: no pueden repetirse para el mismo equipo.",
      );
    if (!lot.photoId || photos.has(lot.photoId))
      fail("Agregá un comprobante distinto para cada lote.");
    if (
      !Number.isSafeInteger(lot.operations) ||
      lot.operations < 1 ||
      lot.operations > 1000000 ||
      !Number.isFinite(new Date(lot.closedAt).getTime())
    )
      fail("Revisá la fecha y la cantidad de operaciones del lote.");
    numbers.add(number);
    photos.add(lot.photoId);
    total += cashCents(lot.total, true);
    operations += lot.operations;
  }
  const difference = cashAmount(total - cashCents(expected, true));
  const needsReview =
    difference !== "0.00" || operations !== expectedOperations;
  if (needsReview && !input.reason?.trim())
    fail("Explicá la diferencia del posnet para continuar.");
  return {
    ...input,
    reason: needsReview ? input.reason?.trim() : "",
    lots: input.lots.map((l) => ({ ...l, number: l.number.trim() })),
    expected,
    expectedOperations,
    total: cashAmount(total),
    operations,
    difference,
    needsReview,
  };
}
