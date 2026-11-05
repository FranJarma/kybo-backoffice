"use client";
import type { ReactNode } from "react";
import { cents } from "@/modules/inventory/decimal";
import { money } from "./shared";
import { shippingPreview, type ShippingDraft } from "./shipping-editor";

export function ReceiptCostSummary({
  lines,
  shipping,
  children,
}: {
  lines: Parameters<typeof shippingPreview>[0];
  shipping: ShippingDraft;
  children?: ReactNode;
}) {
  let preview: ReturnType<typeof shippingPreview> | undefined;
  try {
    preview = shippingPreview(lines, shipping);
  } catch {
    /* The editor reports invalid input when reviewed. */
  }
  return (
    <section aria-label="Costo de esta recepción" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-4">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-brand">
            Costo de esta recepción
          </h3>
          <p className="mt-1 text-2xl font-extrabold tabular-nums text-brand">
            {preview?.landed != null
              ? money(cents(preview.landed))
              : "Costo pendiente"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {preview?.total != null
              ? `Mercadería ${money(cents(preview.total))} · Envío ${money(cents(preview.cost))}`
              : "Se calcula al completar cantidades y precios. Podés recibir con costo pendiente."}
          </p>
        </div>
        {children && (
          <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto">
            {children}
          </div>
        )}
      </div>
    </section>
  );
}
