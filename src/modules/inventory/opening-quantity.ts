import {
  exactDivision,
  integer,
  roundedDivision,
  safeQuantity,
  safeScaled,
  SCALE,
  six,
} from "./decimal";

// Arguments are canonical decimals, after input validation. Cost is per entered
// unit/presentation; value is calculated before conversion to avoid losing cents.
export function openingQuantity(
  quantity: string,
  cost: string | null,
  factor: string,
) {
  const amount = integer(quantity);
  return {
    quantity: safeQuantity(exactDivision(amount * integer(factor), SCALE)),
    value:
      cost === null
        ? null
        : six(safeScaled(roundedDivision(amount * integer(cost), SCALE), 24)),
  };
}
