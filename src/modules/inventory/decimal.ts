import { AppError } from "@/lib/errors";
export const SCALE = 1_000_000n;
export function integer(value: string): bigint {
  return BigInt(value.replace(".", ""));
}
export function fixed(value: bigint, scale = 6): string {
  const negative = value < 0n;
  const digits = (negative ? -value : value)
    .toString()
    .padStart(scale + 1, "0");
  return `${negative ? "-" : ""}${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}
export function roundedDivision(numerator: bigint, divisor: bigint): bigint {
  if (divisor <= 0n) throw new AppError("VALIDATION", "Divisor inválido.", 400);
  return (numerator + divisor / 2n) / divisor;
}
export function exactDivision(numerator: bigint, divisor: bigint): bigint {
  if (divisor === 0n || numerator % divisor !== 0n)
    throw new AppError(
      "VALIDATION",
      "La conversión excede seis decimales.",
      400,
    );
  return numerator / divisor;
}
export function decimal(
  input: unknown,
  scale: 2 | 6,
  required = true,
  positive = false,
): string | null {
  if (input === undefined || input === null || input === "") {
    if (!required) return null;
    throw new AppError("VALIDATION", "Completá la cantidad o el importe.", 400);
  }
  if (typeof input !== "string" || input.length > 80)
    throw new AppError("VALIDATION", "Importe inválido.", 400);
  const text = input.trim();
  if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+)(?:,\d+)?$/.test(text))
    throw new AppError(
      "VALIDATION",
      "Usá coma decimal y punto para miles.",
      400,
    );
  const [whole, fraction = ""] = text.replaceAll(".", "").split(",");
  const normalized = BigInt(whole).toString();
  if (normalized.length > 12 || fraction.length > scale)
    throw new AppError("VALIDATION", "Importe fuera de rango.", 400);
  const value = `${normalized}.${fraction.padEnd(scale, "0")}`;
  if (positive && integer(value) === 0n)
    throw new AppError("VALIDATION", "La cantidad debe ser positiva.", 400);
  return value;
}
export function cents(value: bigint): string {
  return fixed(value, 2);
}
export function six(value: bigint): string {
  return fixed(value);
}
export function safeQuantity(value: bigint): string {
  if (value < 0n || value >= 10n ** 18n)
    throw new AppError("VALIDATION", "Cantidad fuera de rango.", 400);
  return six(value);
}

export function safeScaled(value: bigint, digits: 18 | 24): bigint {
  if (value <= -(10n ** BigInt(digits)) || value >= 10n ** BigInt(digits))
    throw new AppError(
      "VALIDATION",
      "El valor calculado excede el límite permitido.",
      400,
    );
  return value;
}
