"use client";
import { useEffect, useState } from "react";
import { getJson } from "@/components/inventory/shared";
export function selectedBranch() {
  if (typeof document === "undefined") return "";
  return (
    document.cookie
      .split("; ")
      .find((c) => c.startsWith("kybo-branch="))
      ?.split("=")[1] ?? ""
  );
}
export function BranchSelector() {
  const [rows, setRows] = useState<{ id: string; name: string }[]>([]);
  const [selected, setSelected] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    getJson<{ rows: typeof rows }>("/api/branches")
      .then((data) => {
        if (live) {
          setRows(data.rows);
          setSelected(selectedBranch());
        }
      })
      .catch(() => {
        if (live) setError("No se pudieron cargar las sucursales.");
      });
    return () => {
      live = false;
    };
  }, []);
  async function select(branchId: string) {
    if (!branchId) return;
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
    <div className="space-y-1">
      <label className="text-xs font-semibold" htmlFor="active-branch">
        Sucursal
      </label>
      <select
        id="active-branch"
        className="w-full rounded-lg border bg-white px-3 py-2 text-sm text-slate-900"
        value={selected}
        disabled={busy}
        onChange={(event) => void select(event.target.value)}
      >
        <option value="">Seleccioná una sucursal</option>
        {rows.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
