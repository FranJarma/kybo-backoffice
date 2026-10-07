import { AppError } from "@/lib/errors";
import type { Decimal } from "../operations/types";
export type BaseUnit = "g" | "ml" | "unit";
export type Unit = BaseUnit | "kg" | "l";
const units: Record<Unit, { base: BaseUnit; factor: bigint }> = {
  g: { base: "g", factor: 1n },
  kg: { base: "g", factor: 1000n },
  ml: { base: "ml", factor: 1n },
  l: { base: "ml", factor: 1000n },
  unit: { base: "unit", factor: 1n },
};
export function convertToBase(
  value: string,
  unit: Unit,
  baseUnit: BaseUnit,
): Decimal {
  if (
    !units[unit] ||
    units[unit].base !== baseUnit ||
    !/^\d{1,12}(?:\.\d{1,6})?$/.test(value)
  )
    throw new AppError(
      "INVALID_QUANTITY",
      "Cantidad o unidad incompatible.",
      400,
    );
  const [whole, fraction = ""] = value.split(".");
  const scaled =
    (BigInt(whole) * 1000000n + BigInt(fraction.padEnd(6, "0"))) *
    units[unit].factor;
  if (scaled >= 10n ** 18n)
    throw new AppError(
      "INVALID_QUANTITY",
      "La cantidad supera el límite permitido.",
      400,
    );
  return `${scaled / 1000000n}.${(scaled % 1000000n).toString().padStart(6, "0")}`;
}
