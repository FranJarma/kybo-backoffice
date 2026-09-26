"use client";
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
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-2 block text-xs font-semibold text-brand">
        {label}
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
        Al confirmar, el pedido aparece en Comandas. El descuento de stock
        todavía no está conectado a las ventas.
      </p>
    </div>
  );
}
export function OperationNotice({
  error,
  uncertain,
  busy,
  retry,
}: {
  error: string;
  uncertain: boolean;
  busy: boolean;
  retry: () => void;
}) {
  if (!error && !uncertain) return null;
  return (
    <div
      role="alert"
      className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
    >
      <p>{error}</p>
      {uncertain && (
        <Button
          className="mt-3"
          variant="outline"
          disabled={busy}
          onClick={retry}
        >
          <RotateCw size={16} />
          {busy ? "Confirmando…" : "Reintentar mismo envío"}
        </Button>
      )}
    </div>
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
}: {
  kind: "customers" | "payment-methods";
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  empty?: string;
  initialName?: string;
}) {
  const id = useId(),
    [q, setQ] = useState(""),
    [data, setData] = useState<SaleLookup>({ rows: [], total: 0 }),
    [cached, setCached] = useState<{ id: string; name: string } | null>(
      value && initialName ? { id: value, name: initialName } : null,
    ),
    [error, setError] = useState(""),
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
  }, [kind, q]);
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
        {label}
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
        <p role="alert" className="mt-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
