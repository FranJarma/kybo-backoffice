import { decimal, fixed, integer } from "../inventory/decimal";

export const entryUnits = [
  { value: "l", label: "Litro (l)" },
  { value: "ml", label: "Mililitro (ml)" },
  { value: "kg", label: "Kilogramo (kg)" },
  { value: "g", label: "Gramo (g)" },
  { value: "unit", label: "Unidad" },
];
export const costUnitLabels: Record<string, string> = {
  l: "litro",
  ml: "mililitro",
  kg: "kilo",
  g: "gramo",
  unit: "unidad",
};
export function baseUnit(unit: string) {
  return unit === "l" ? "ml" : unit === "kg" ? "g" : unit;
}
const factor = (unit: string) => (unit === "l" || unit === "kg" ? 1000n : 1n);
const input = (value: bigint) =>
  fixed(value).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",");

export function toBaseCost(unit: string, cost: string) {
  const parsed = decimal(cost.trim(), 6, false);
  if (parsed === null) return { baseUnit: baseUnit(unit), unitCost: "" };
  const amount = integer(parsed);
  if (amount % factor(unit) !== 0n)
    throw new Error(
      "El costo por litro o kilo admite hasta 3 decimales. Revisá el importe.",
    );
  return {
    baseUnit: baseUnit(unit),
    unitCost: fixed(amount / factor(unit)).replace(".", ","),
  };
}

export function displayCost(unit: string, stored: string | null) {
  return stored === null ? "" : input(integer(stored) * factor(unit));
}

export function changeCostUnit(from: string, to: string, cost: string) {
  if (!cost.trim() || baseUnit(from) !== baseUnit(to)) return "";
  const converted = toBaseCost(from, cost);
  return displayCost(to, converted.unitCost.replace(",", "."));
}
