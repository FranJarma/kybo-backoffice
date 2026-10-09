import { AppError } from "@/lib/errors";
import {
  decimal,
  integer,
  safeQuantity,
  SCALE,
} from "@/modules/inventory/decimal";

export function parseWaste(value: unknown): string {
  const result = decimal(value ?? "0", 2)!;
  if (integer(result) >= 10_000n)
    throw new AppError(
      "VALIDATION",
      "La merma debe ser mayor o igual a 0 y menor que 100%.",
      400,
    );
  return result;
}

// Inputs are canonical database decimals. Round up once, after scaling the net quantity.
export function consumptionQuantity(
  quantity: string,
  wastePercent = "0.00",
  multiplier = SCALE,
  divisor = SCALE,
): string {
  const percent = integer(wastePercent);
  if (percent < 0n || percent >= 10_000n || divisor <= 0n || multiplier < 0n)
    throw new AppError("VALIDATION", "Merma o cantidad inválida.", 400);
  const numerator = integer(quantity) * multiplier * 10_000n;
  const denominator = divisor * (10_000n - percent);
  return safeQuantity((numerator + denominator - 1n) / denominator);
}
