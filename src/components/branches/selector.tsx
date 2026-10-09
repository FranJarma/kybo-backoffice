"use client";
import { useState } from "react";
import { Store } from "lucide-react";
export type BranchChoice = { id: string; name: string };
export function BranchSelector({
  rows = [],
  selected = "",
}: {
  rows?: BranchChoice[];
  selected?: string;
}) {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
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
    <div className="relative min-w-0 w-full sm:w-52">
      <label className="sr-only" htmlFor="active-branch">
        Sucursal
      </label>
      <Store
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute left-3 top-3 text-muted"
      />
      <select
        id="active-branch"
        className="h-10 w-full truncate rounded-lg border border-line bg-surface py-2 pl-9 pr-6 text-xs font-semibold text-brand"
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
      {error && (
        <p
          role="alert"
          className="absolute right-0 top-full z-30 mt-2 w-64 rounded-lg border border-red-200 bg-white p-3 text-xs text-red-700 shadow-sm"
        >
          {error}
        </p>
      )}
    </div>
  );
}
