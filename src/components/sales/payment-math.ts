import { cents, decimal, integer } from "@/modules/inventory/decimal";

export function paymentAmountCents(value: string): bigint | null {
  try {
    return integer(decimal(value, 2, true, true)!);
  } catch {
    return null;
  }
}

export function paymentAllocation(
  total: string,
  amounts: string[],
  exact: boolean,
) {
  const due = integer(total);
  const applied = amounts.map(paymentAmountCents);
  const assigned = applied.reduce<bigint>(
    (sum, value) => sum + (value ?? 0n),
    0n,
  );
  const remaining = due - assigned;
  return {
    applied,
    assigned,
    remaining,
    valid:
      assigned > 0n &&
      remaining >= 0n &&
      (!exact || remaining === 0n) &&
      applied.every((value) => value !== null),
  };
}

function cashAmounts(received: string, collection: string) {
  const tendered = paymentAmountCents(received);
  const applied = paymentAmountCents(collection);
  return tendered !== null && applied !== null && tendered >= applied
    ? { received: tendered, applied }
    : null;
}

/** Received cash is only a change aid; callers submit the collection amount. */
export function cashChange(
  received: string,
  collection: string,
): { valid: boolean; change: string | null } {
  if (!received.trim()) return { valid: true, change: null };
  const cash = cashAmounts(received, collection);
  return cash
    ? { valid: true, change: cents(cash.received - cash.applied) }
    : { valid: false, change: null };
}

export type CashPaymentSummary = {
  applied: string;
  received: string;
  change: string;
};

/** Display data for the receipt, separate from the payment sent to the server. */
export function cashPaymentSummary(
  rows: { amount: string; received: string }[],
): CashPaymentSummary | undefined {
  if (!rows.length) return undefined;
  let applied = 0n;
  let received = 0n;
  for (const row of rows) {
    const cash = cashAmounts(row.received, row.amount);
    if (!cash) return undefined;
    applied += cash.applied;
    received += cash.received;
  }
  return {
    applied: cents(applied),
    received: cents(received),
    change: cents(received - applied),
  };
}
