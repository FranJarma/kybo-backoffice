import { AppError } from "@/lib/errors";
import { cents, integer, roundedDivision } from "@/modules/inventory/decimal";

export const vatRates = [
  "0.00",
  "2.50",
  "5.00",
  "10.50",
  "21.00",
  "27.00",
] as const;
const invalid = (): never => {
  throw new AppError("VALIDATION", "Revisá los importes y porcentajes.", 400);
};
function money(value: string): bigint {
  if (!/^\d{1,12}\.\d{2}$/.test(value)) invalid();
  const result = integer(value);
  if (result >= 10n ** 14n) invalid();
  return result;
}
function bounded(value: bigint) {
  if (value < 0n || value >= 10n ** 14n) invalid();
  return cents(value);
}
function vat(rate: string): bigint {
  if (!(vatRates as readonly string[]).includes(rate)) invalid();
  return integer(rate);
}
/** Canonical decimal strings only; null is pending, never a zero-rate assumption. */
export function priceWithVat(net: string, rate: string | null): string | null {
  const value = money(net);
  return rate === null
    ? null
    : bounded(roundedDivision(value * (10000n + vat(rate)), 10000n));
}
/** Catalog and modifier amounts are already final; VAT is extracted in costing. */
export function catalogFinalPrice(
  final: string,
  rate: string | null,
): string | null {
  const value = money(final);
  if (rate === null) return null;
  vat(rate);
  return bounded(value);
}
export function vatBreakdown(gross: string, rate: string) {
  const total = money(gross);
  const net = roundedDivision(total * 10000n, 10000n + vat(rate));
  return { netTotal: bounded(net), vatTotal: bounded(total - net) };
}
/** Estimated provider cost, separate from the amount paid by the customer. */
export function paymentFee(gross: string, percent: string | null) {
  const total = money(gross);
  if (percent === null) return { commissionAmount: null, settlementNet: null };
  if (!/^\d{1,3}\.\d{2}$/.test(percent)) invalid();
  const rate = integer(percent);
  if (rate > 10000n) invalid();
  const fee = roundedDivision(total * rate, 10000n);
  return {
    commissionAmount: bounded(fee),
    settlementNet: bounded(total - fee),
  };
}
