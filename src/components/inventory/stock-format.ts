import { money } from "@/lib/number-format";
import { displayCost } from "@/modules/catalog/entry-units";
import {
  transferEntryUnit,
  formatTransferAmount,
} from "@/modules/transfers/quantities";

export { formatTransferQuantity as stockQuantity } from "@/modules/transfers/quantities";
export function stockBaseQuantity(value: string, baseUnit: string) {
  return `${formatTransferAmount(value, "unit")} ${baseUnit === "unit" ? "unid." : baseUnit}`;
}
export function stockUnitCost(value: string | null, baseUnit: unknown) {
  if (value === null) return "Pendiente";
  const unit = transferEntryUnit(baseUnit);
  return unit
    ? `${money(displayCost(unit.unit, value).replace(",", "."))} /${unit.symbol}`
    : money(value);
}
