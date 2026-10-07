import { AppError } from "@/lib/errors";
export function nextValuation(
  quantity: bigint,
  value: bigint | null,
  delta: bigint,
  incomingValue: bigint | null,
) {
  if (
    quantity < 0n ||
    (value !== null && value < 0n) ||
    (incomingValue !== null && incomingValue < 0n) ||
    quantity + delta < 0n
  )
    throw new AppError(
      "STOCK_CONFLICT",
      "La cantidad o valoración no es válida.",
      409,
    );
  if (delta === 0n) return { quantity, value, appliedValue: 0n };
  const nextQuantity = quantity + delta;
  if (delta > 0n)
    return {
      quantity: nextQuantity,
      value:
        quantity === 0n
          ? incomingValue
          : value === null || incomingValue === null
            ? null
            : value + incomingValue,
      appliedValue: incomingValue,
    };
  const appliedValue =
    value === null
      ? null
      : nextQuantity === 0n
        ? -value
        : -((value * -delta + quantity / 2n) / quantity);
  return {
    quantity: nextQuantity,
    value:
      nextQuantity === 0n ? 0n : value === null ? null : value + appliedValue!,
    appliedValue,
  };
}
