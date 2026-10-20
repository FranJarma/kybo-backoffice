"use client";
import { decimal } from "@/modules/inventory/decimal";
import { money } from "@/lib/number-format";
export function ProductPricePreview({
  price,
  rate,
  label,
}: {
  price: string;
  rate: string;
  label: string;
}) {
  let value: string | null = null;
  let message = "Completá un precio válido.";
  try {
    if (price) value = decimal(price, 2)!;
  } catch {
    message = "Revisá el precio y la alícuota.";
  }
  return (
    <div
      aria-live="polite"
      className="rounded-xl border border-blue-100 bg-blue-50/50 p-4"
    >
      <p className="text-xs text-muted">Precio final al cliente · {label}</p>
      <p className="mt-1 text-lg font-bold text-brand">
        {value === null ? "Pendiente" : money(value)}
      </p>
      {value === null && <p className="mt-1 text-xs text-muted">{message}</p>}
      {!rate && (
        <p className="mt-1 text-xs text-muted">
          Falta configurar la alícuota para desglosar el IVA en Costeo.
        </p>
      )}
    </div>
  );
}
