"use client";
import { useErrorFeedback } from "@/components/ui/use-error-feedback";
import { OperationAlert } from "@/components/ui/operation-alert";
import { FieldCaption } from "@/components/ui/field-caption";
import { useEffect, useId, useState } from "react";
import { Info, RotateCw } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getJson } from "@/components/inventory/shared";
import type { SaleLookup } from "@/modules/sales/types";
export const selectClass =
  "h-11 w-full min-w-0 rounded-lg border border-line bg-white px-3 text-sm text-brand outline-none focus:border-blue focus:ring-2 focus:ring-blue/15 disabled:opacity-60";
export function Control({
  label,
  children,
  required = false,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-2 block text-xs font-semibold text-brand">
        <FieldCaption required={required}>{label}</FieldCaption>
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
      <OperationAlert
        eventKey={eventKey}
        tone="error"
        title="No pudimos completar la operación"
        message={error}
      />
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
export function LookupSelect({
  kind,
  label,
  value,
  onChange,
  disabled = false,
  empty = "Seleccionar",
  initialName,
  required = false,
}: {
  kind: "customers" | "payment-methods";
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  empty?: string;
  initialName?: string;
  required?: boolean;
}) {
  const id = useId(),
    [q, setQ] = useState(""),
    [data, setData] = useState<SaleLookup>({ rows: [], total: 0 }),
    [cached, setCached] = useState<{ id: string; name: string } | null>(
      value && initialName ? { id: value, name: initialName } : null,
    ),
    [error, setError, errorAttempt] = useErrorFeedback(),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      setLoading(true);
      getJson<SaleLookup>(
        `/api/sales/lookup?kind=${kind}&q=${encodeURIComponent(q)}`,
      )
        .then((r) => {
          if (live) {
            setData(r);
            setError("");
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [kind, q, setError]);
  const options = data.rows.some((r) => r.id === value)
    ? data.rows
    : cached?.id === value
      ? [cached, ...data.rows]
      : data.rows;
  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className="mb-2 block text-xs font-semibold text-brand"
      >
        <FieldCaption required={required}>{label}</FieldCaption>
      </label>
      {(data.total > 30 || q) && (
        <Input
          className="mb-2"
          aria-label={`Buscar ${label.toLowerCase()}`}
          placeholder="Buscar por nombre…"
          value={q}
          disabled={disabled}
          onChange={(e) => setQ(e.target.value)}
        />
      )}
      <select
        id={id}
        className={selectClass}
        value={value}
        required={required}
        disabled={disabled || loading}
        onChange={(e) => {
          setCached(options.find((r) => r.id === e.target.value) ?? null);
          onChange(e.target.value);
        }}
      >
        <option value="">{loading ? "Cargando…" : empty}</option>
        {options.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      {error && (
        <OperationAlert
          eventKey={errorAttempt}
          tone="error"
          title="No pudimos completar la operación"
          message={error}
        />
      )}
    </div>
  );
}
