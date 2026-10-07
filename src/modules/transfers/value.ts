import { AppError } from "@/lib/errors";
export function transferPortion(
  dispatched: bigint,
  value: bigint | null,
  settled: bigint,
  settledValue: bigint,
  portion: bigint,
): bigint | null {
  if (
    dispatched <= 0n ||
    settled < 0n ||
    settledValue < 0n ||
    portion <= 0n ||
    settled + portion > dispatched ||
    (value !== null && (value < 0n || settledValue > value))
  )
    throw new AppError(
      "TRANSFER_CONFLICT",
      "La cantidad supera el tránsito pendiente.",
      409,
    );
  if (value === null) return null;
  if (settled + portion === dispatched) return value - settledValue;
  // Allocate from the remaining value to avoid rounding beyond the remainder.
  const remaining = dispatched - settled;
  return ((value - settledValue) * portion + remaining / 2n) / remaining;
}
