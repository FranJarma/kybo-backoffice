import {
  cents,
  integer,
  roundedDivision,
  six,
} from "@/modules/inventory/decimal";
import type { ExpenseEntry } from "./types";

/** Multiply the original monthly ratio before rounding, including for combos. */
export function allocateOverhead(
  total: string | null,
  units: number | null,
  productUnits: number,
): string | null {
  if (total === null || !units || productUnits <= 0) return null;
  return six(
    roundedDivision(
      integer(total) * 10000n * BigInt(productUnits),
      BigInt(units),
    ),
  );
}
export function summarizeExpenses(
  entries: ExpenseEntry[],
  expectedUnits: number | null,
  actualUnits: number,
) {
  const sum = (key: "budget" | "actual") =>
    cents(
      entries.reduce(
        (s, e) => s + (e[key] === null ? 0n : integer(e[key]!)),
        0n,
      ),
    );
  const budgetPending = entries.filter((e) => e.budget === null).length;
  const actualPending = entries.filter((e) => e.actual === null).length;
  const budgetTotal = sum("budget"),
    actualTotal = sum("actual");
  return {
    budgetTotal,
    actualTotal,
    budgetPending,
    actualPending,
    budgetRate:
      entries.length && !budgetPending
        ? allocateOverhead(budgetTotal, expectedUnits, 1)
        : null,
    actualRate:
      entries.length && !actualPending
        ? allocateOverhead(actualTotal, actualUnits, 1)
        : null,
  };
}
