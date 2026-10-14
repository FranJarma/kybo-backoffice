const quantityFormatter = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 2,
});
const moneyFormatter = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Presentation only: retain the original values for editing and calculations.
export function quantity(value: string, unit?: string) {
  return `${quantityFormatter.format(Number(value.replace(",", ".")))}${unit ? ` ${unit === "unit" ? "unid." : unit}` : ""}`;
}

export function money(value: string | null) {
  return value === null ? "Pendiente" : moneyFormatter.format(Number(value));
}
