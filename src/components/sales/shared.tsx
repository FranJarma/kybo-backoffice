"use client";
import { OperationAlert } from "@/components/ui/operation-alert";
import { FieldCaption } from "@/components/ui/field-caption";
import { StockShortageNotice } from "./stock-shortage-notice";
import { Info, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
export const selectClass =
  "h-11 w-full min-w-0 rounded-lg border border-line bg-white px-3 text-sm text-brand outline-none focus:border-blue focus:ring-2 focus:ring-blue/15 disabled:opacity-60";
export function Control({
  label,
  children,
  required = false,
  optional = false,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-2 block text-xs font-semibold text-brand">
        <FieldCaption required={required} optional={optional}>
          {label}
        </FieldCaption>
      </span>
      {children}
    </label>
  );
}
export function SalesScope() {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2.5 text-xs leading-relaxed text-blue-900">
      <Info size={15} className="mt-0.5 shrink-0" />
      <p>
        Al confirmar se reserva el stock. Los productos a preparar aparecen en
        Comandas y descuentan sus ingredientes al terminar; los de venta directa
        se descuentan al entregarlos.
      </p>
    </div>
  );
}
export function OperationNotice({
  error,
  uncertain,
  busy,
  retry,
  eventKey,
}: {
  error: string;
  uncertain: boolean;
  busy: boolean;
  retry: () => void;
  eventKey?: number | string;
}) {
  if (!error && !uncertain) return null;
  return (
    <>
      {error.startsWith("No hay stock disponible suficiente para reservar:") ? (
        <StockShortageNotice key={`${eventKey}:${error}`} message={error} />
      ) : (
        <OperationAlert
          eventKey={eventKey}
          tone="error"
          title="No pudimos completar la operación"
          message={error}
        />
      )}
      {uncertain && (
        <div
          role="status"
          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
        >
          <p>El resultado del envío está pendiente de confirmar.</p>
          <Button
            className="mt-3"
            variant="outline"
            disabled={busy}
            onClick={retry}
          >
            <RotateCw size={16} />
            {busy ? "Confirmando…" : "Reintentar mismo envío"}
          </Button>
        </div>
      )}
    </>
  );
}
