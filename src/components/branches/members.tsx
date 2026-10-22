"use client";
import { useErrorFeedback } from "@/components/ui/use-error-feedback";
import { FieldCaption } from "@/components/ui/field-caption";
import { OperationAlert } from "@/components/ui/operation-alert";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { getJson } from "@/components/inventory/shared";
type Member = {
  id: string;
  name: string;
  role: "manager" | "staff" | null;
  revokedAt: string | null;
  catalogManager: boolean;
};
export function BranchMembers({ branchId }: { branchId: string }) {
  const [rows, setRows] = useState<Member[]>([]),
    [version, setVersion] = useState(0),
    [error, setError, errorAttempt] = useErrorFeedback();
  useEffect(() => {
    let live = true;
    getJson<{ rows: Member[] }>(`/api/branches/${branchId}/members`)
      .then((r) => {
        if (live) setRows(r.rows);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [branchId, version, setError]);
  return (
    <section className="surface-panel space-y-4 p-5">
      <h2 className="text-xl font-bold">Accesos a esta sucursal</h2>
      <Link
        href="/settings/users"
        className="inline-flex min-h-10 items-center text-sm font-medium text-blue hover:underline"
      >
        Crear y administrar usuarios
      </Link>
      <p className="text-sm text-muted">
        El permiso de catálogo es compartido por todas las sucursales. El rol
        operativo corresponde únicamente a esta sucursal.
      </p>
      {error && (
        <OperationAlert
          eventKey={errorAttempt}
          tone="error"
          title="No pudimos completar la operación"
          message={error}
        />
      )}
      {rows.map((row) => (
        <MemberForm
          key={`${row.id}:${version}`}
          row={row}
          branchId={branchId}
          saved={() => setVersion((v) => v + 1)}
        />
      ))}
    </section>
  );
}
function MemberForm({
  row,
  branchId,
  saved,
}: {
  row: Member;
  branchId: string;
  saved: () => void;
}) {
  const [role, setRole] = useState(row.role ?? "staff"),
    [enabled, setEnabled] = useState(!!row.role && !row.revokedAt),
    [catalog, setCatalog] = useState(row.catalogManager),
    [busy, setBusy] = useState(false),
    [error, setError, errorAttempt] = useErrorFeedback();
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch(`/api/branches/${branchId}/members`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: row.id,
          role,
          revoked: !enabled,
          catalogManager: catalog,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "No se pudo guardar.");
      saved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={save} className="border-t pt-4">
      <fieldset disabled={busy} className="flex flex-wrap items-center gap-4">
        <strong>{row.name}</strong>
        <label>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
          />{" "}
          Acceso habilitado
        </label>
        <label>
          <FieldCaption required>Rol</FieldCaption>
          <select
            required
            value={role}
            onChange={(e) => setRole(e.target.value as "staff" | "manager")}
            className="rounded border p-2"
          >
            <option value="staff">Personal</option>
            <option value="manager">Encargado</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={catalog}
            onChange={(e) => setCatalog(e.target.checked)}
          />{" "}
          Gestiona catálogo compartido
        </label>
        <Button type="submit">Guardar accesos</Button>
      </fieldset>
      {error && (
        <OperationAlert
          eventKey={errorAttempt}
          tone="error"
          title="No pudimos completar la operación"
          message={error}
        />
      )}
    </form>
  );
}
