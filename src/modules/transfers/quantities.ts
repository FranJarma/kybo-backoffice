import { AppError } from "@/lib/errors";
import { decimal, integer, safeQuantity, SCALE } from "../inventory/decimal";
import type { BaseUnit, Unit } from "../items/units";

const entryUnits: Record<
  BaseUnit,
  { unit: Unit; label: string; symbol: string; factor: bigint }
> = {
  ml: { unit: "l", label: "litros", symbol: "l", factor: 1000n },
  g: { unit: "kg", label: "kilos", symbol: "kg", factor: 1000n },
  unit: { unit: "unit", label: "unidades", symbol: "unid.", factor: 1n },
};
export function transferEntryUnit(baseUnit: unknown) {
  return baseUnit === "g" || baseUnit === "ml" || baseUnit === "unit"
    ? entryUnits[baseUnit]
    : null;
}
export function parseTransferQuantity(
  input: string,
  baseUnit: unknown,
): string {
  const unit = transferEntryUnit(baseUnit);
  if (!unit)
    throw new AppError(
      "INVALID_QUANTITY",
      "Seleccioná un artículo para conocer su unidad.",
      400,
    );
  // Nine fractional digits in litres/kg equal six in the ml/g ledger.
  // Parsing at this scale preserves even the smallest existing allocation.
  const scale = unit.factor === 1n ? 6 : 9;
  const normalized = decimal(input, scale, true, true)!;
  return safeQuantity(integer(normalized));
}
/** Format canonical stock without rounding small positive amounts down to zero. */
export function formatTransferQuantity(
  value: string,
  baseUnit: unknown,
): string {
  const unit = transferEntryUnit(baseUnit);
  if (!unit) return `${value} (unidad no disponible)`;
  return `${formatTransferAmount(value, baseUnit)} ${unit.symbol}`;
}
export function formatTransferAmount(value: string, baseUnit: unknown): string {
  const unit = transferEntryUnit(baseUnit);
  if (!unit)
    throw new AppError("VALIDATION", "Unidad de insumo inválida.", 400);
  const q = integer(value),
    denominator = SCALE * unit.factor;
  const negative = q < 0n,
    absolute = negative ? -q : q;
  const scale = unit.factor === 1n ? 6 : 9;
  const fraction = (absolute % denominator)
    .toString()
    .padStart(scale, "0")
    .replace(/0+$/, "");
  return `${negative ? "-" : ""}${(absolute / denominator).toLocaleString("es-AR")}${fraction ? "," + fraction : ""}`;
}
