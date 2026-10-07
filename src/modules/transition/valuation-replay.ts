import { integer, six } from "../inventory/decimal";
import { nextValuation } from "../inventory/valuation";
export type ValuationState = { quantity: string; value: string | null };
export function replayValuation(
  initial: ValuationState,
  movements: { quantity: string; value: string | null }[],
) {
  let quantity = integer(initial.quantity),
    value = initial.value === null ? null : integer(initial.value);
  const invalidMovements: number[] = [];
  for (const [index, movement] of movements.entries()) {
    const delta = integer(movement.quantity),
      recorded = movement.value === null ? null : integer(movement.value);
    try {
      const next = nextValuation(
        quantity,
        value,
        delta,
        delta > 0n ? recorded : null,
      );
      if (next.appliedValue !== recorded) invalidMovements.push(index);
      quantity = next.quantity;
      value = next.value;
    } catch {
      invalidMovements.push(index);
      quantity += delta;
      value = null;
    }
  }
  return {
    quantity: six(quantity),
    value: value === null ? null : six(value),
    invalidMovements,
  };
}
