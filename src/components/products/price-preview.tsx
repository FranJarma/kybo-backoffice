"use client";
import { decimal } from "@/modules/inventory/decimal";
import { priceWithVat } from "@/modules/pricing/amounts";
import { money } from "@/lib/number-format";
export function ProductPricePreview({
  net,
  rate,
  label,
}: {
  net: string;
  rate: string;
  label: string;
}) {
  let value: string | null = null;
  let message = rate
    ? "Completá un precio válido."
    : "Configurá el IVA para calcularlo.";
  try {
    if (net && rate)
      value = priceWithVat(
        decimal(net, 2)!,
        Number(rate.replace(",", ".")).toFixed(2),
      );
  } catch {
    message = "Revisá el precio y la alícuota.";
  }
  return (
    <div
      aria-live="polite"
      className="rounded-xl border border-blue-100 bg-blue-50/50 p-4"
    >
      <p className="text-xs text-muted">Precio final con IVA · {label}</p>
      <p className="mt-1 text-lg font-bold text-brand">
        {value === null ? "Pendiente" : money(value)}
      </p>
      {value === null && <p className="mt-1 text-xs text-muted">{message}</p>}
    </div>
  );
}
