"use client";
import { useErrorFeedback } from "@/components/ui/use-error-feedback";
import { OperationAlert } from "@/components/ui/operation-alert";
import { useState } from "react";
import { ChevronDown, Store } from "lucide-react";
export type BranchChoice = { id: string; name: string };
export function BranchSelector({
  rows = [],
  selected = "",
  readOnly = false,
}: {
  rows?: BranchChoice[];
  selected?: string;
  readOnly?: boolean;
}) {
  const [error, setError, errorAttempt] = useErrorFeedback();
  const [busy, setBusy] = useState(false);
  const current = rows.find((row) => row.id === selected);
  const [branchName, ...address] = (
    current?.name ?? "Seleccioná una sucursal"
  ).split(/\s+[—–]\s+/);
  async function select(branchId: string) {
    if (!branchId || branchId === selected) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/branches/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ branchId }),
      });
      if (!response.ok) throw new Error("No tenés acceso a esa sucursal.");
      window.location.reload();
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "No se pudo cambiar de sucursal.",
      );
      setBusy(false);
    }
  }
  return (
    <div
      className={`relative flex h-11 w-full min-w-0 items-center gap-2.5 rounded-lg px-2 text-left transition-colors ${readOnly ? "" : "hover:bg-surface focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-blue"}`}
      title={current?.name}
      aria-busy={busy}
    >
      <span className="pointer-events-none flex size-8 shrink-0 items-center justify-center rounded-lg bg-surface text-muted">
        <Store size={16} aria-hidden="true" />
      </span>
      <span className="pointer-events-none min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold leading-5 text-brand">
          {branchName}
        </span>
        <span className="block truncate text-[11px] leading-4 text-muted">
          {busy
            ? "Cambiando sucursal…"
            : address.join(" · ") ||
              (readOnly ? "Sucursal asignada" : "Sucursal activa")}
        </span>
      </span>
      {!readOnly ? (
        <>
          <ChevronDown
            size={14}
            aria-hidden="true"
            className="pointer-events-none shrink-0 text-muted"
          />
          <label className="sr-only" htmlFor="active-branch">
            Sucursal
          </label>
          <select
            id="active-branch"
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
            value={rows.some((row) => row.id === selected) ? selected : ""}
            disabled={busy || !rows.length}
            onChange={(event) => void select(event.target.value)}
          >
            <option value="">
              {rows.length
                ? "Seleccioná una sucursal"
                : "Sin sucursales disponibles"}
            </option>
            {rows.map((row) => (
              <option key={row.id} value={row.id}>
                {row.name}
              </option>
            ))}
          </select>
        </>
      ) : null}
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
