import {
  decimal,
  exactDivision,
  integer,
  roundedDivision,
  safeQuantity,
  six,
  SCALE,
} from "../inventory/decimal";
import { baseUnit } from "../catalog/entry-units";

export function presentationQuantity(
  units: string,
  content: string,
  unit: string,
) {
  const count = integer(decimal(units, 6, true, true)!);
  const amount = integer(decimal(content, 6, true, true)!);
  const factor = unit === "l" || unit === "kg" ? 1000n : 1n;
  if (!["l", "ml", "kg", "g", "unit"].includes(unit))
    throw new Error("Elegí una unidad.");
  return safeQuantity(exactDivision(count * amount * factor, SCALE));
}
export { baseUnit };
export function comparablePrice(price: string, quantity: string, unit: string) {
  const factor = unit === "ml" || unit === "g" ? 1000n : 1n;
  return {
    amount: six(
      roundedDivision(integer(price) * SCALE * factor, integer(quantity)),
    ),
    unit: unit === "ml" ? "l" : unit === "g" ? "kg" : "unidad",
  };
}
