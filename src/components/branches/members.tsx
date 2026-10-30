"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  Globe2,
  LoaderCircle,
  ShieldCheck,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldCaption } from "@/components/ui/field-caption";
import { getJson } from "@/components/inventory/shared";
import { memberAccess } from "./presentation";

type Member = {
  id: string;
  name: string;
  accountRole?: string;
  role: "manager" | "staff" | null;
  revokedAt: string | null;
  catalogManager: boolean;
};

export function BranchMembers({ branchId }: { branchId: string }) {
  const [rows, setRows] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let live = true;
    getJson<{ rows: Member[] }>(`/api/branches/${branchId}/members`)
      .then((r) => {
        if (live) {
          setRows(r.rows);
          setError("");
        }
      })
      .catch(() => {
        if (live) setError("No pudimos cargar los accesos del equipo.");
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [branchId, version]);
  const enabledCount = rows.filter((row) => memberAccess(row).enabled).length;
  return (
    <section>
      <div className="branches-section-heading">
        <div>
          <p className="branches-kicker">Personas y permisos</p>
          <h2>Equipo y accesos</h2>
          <p>
            {loading
              ? "Consultando el equipo…"
              : error
                ? "Administrá quién puede operar en este local."
                : `${enabledCount} de ${rows.length} personas con acceso a esta sucursal.`}
          </p>
        </div>
        <Button variant="outline" className="branches-action" asChild>
          <Link href="/settings/users">
            Administrar usuarios
            <ArrowUpRight />
          </Link>
        </Button>
      </div>
      <div className="branches-info">
        <ShieldCheck aria-hidden="true" />
        <p>
          <strong>Los roles se asignan por sucursal.</strong> El permiso de
          catálogo se aplica a todas. Los administradores tienen acceso a todos
          los locales.
        </p>
      </div>
      {error ? (
        <div role="alert" className="branches-error">
          {error}
          <Button
            variant="outline"
            onClick={() => {
              setLoading(true);
              setVersion((v) => v + 1);
            }}
          >
            Reintentar
          </Button>
        </div>
      ) : loading ? (
        <p role="status" className="branches-loading">
          Cargando equipo…
        </p>
      ) : !rows.length ? (
        <div className="branches-empty">
          <Users />
          <h3>No hay usuarios habilitados</h3>
          <p>
            Creá las cuentas desde Administrar usuarios y después asigná los
            accesos.
          </p>
        </div>
      ) : (
        <div className="branches-members">
          <div className="branches-member-head">
            <span>Persona</span>
            <span>Acceso a esta sucursal</span>
            <span>Catálogo compartido</span>
            <span className="sr-only">Guardar</span>
          </div>
          {rows.map((row) => (
            <MemberForm
              key={row.id}
              row={row}
              branchId={branchId}
              saved={(updated) =>
                setRows((current) =>
                  current.map((member) =>
                    member.id === updated.id ? updated : member,
                  ),
                )
              }
            />
          ))}
        </div>
      )}
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
  saved: (row: Member) => void;
}) {
  const [role, setRole] = useState(row.role ?? "staff");
  const [enabled, setEnabled] = useState(!!row.role && !row.revokedAt);
  const [catalog, setCatalog] = useState(row.catalogManager);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const access = memberAccess(row);
  const dirty =
    enabled !== (!!row.role && !row.revokedAt) ||
    (enabled && role !== row.role) ||
    catalog !== row.catalogManager;
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
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
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "No pudimos guardar los accesos.");
      saved({
        ...row,
        role,
        revokedAt: enabled ? null : new Date().toISOString(),
        catalogManager: catalog,
      });
      setNotice("Accesos guardados");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No pudimos guardar los accesos.",
      );
    } finally {
      setBusy(false);
    }
  }
  const identity = (
    <div className="branches-person">
      <span className="branches-avatar" aria-hidden="true">
        {row.name.slice(0, 1).toUpperCase()}
      </span>
      <div>
        <strong>{row.name}</strong>
        <span
          className={`branches-status ${access.enabled ? "active" : "inactive"}`}
        >
          <span />
          {access.label}
        </span>
      </div>
    </div>
  );
  if (access.global)
    return (
      <div className="branches-member-row branches-member-admin">
        {identity}
        <div>
          <ShieldCheck aria-hidden="true" />
          <span>Acceso a todas las sucursales</span>
        </div>
        <div>
          <Globe2 aria-hidden="true" />
          <span>Gestión de catálogo incluida</span>
        </div>
        <span className="branches-admin-note">Cuenta administradora</span>
      </div>
    );
  return (
    <form
      onSubmit={save}
      className="branches-member-form"
      aria-label={`Accesos de ${row.name}`}
    >
      <fieldset disabled={busy} className="branches-member-row">
        {identity}
        <div className="branches-local-access">
          <label className="branches-check">
            <input
              type="checkbox"
              checked={enabled}
              onChange={(e) => {
                setEnabled(e.target.checked);
                setNotice("");
              }}
            />
            Acceso habilitado
          </label>
          <label className="branches-role">
            <FieldCaption required={enabled}>Rol en el local</FieldCaption>
            <select
              required
              disabled={!enabled}
              value={role}
              onChange={(e) => {
                setRole(e.target.value as "staff" | "manager");
                setNotice("");
              }}
            >
              <option value="staff">Personal</option>
              <option value="manager">Encargado</option>
            </select>
          </label>
        </div>
        <div className="branches-global-access">
          <label className="branches-check">
            <input
              type="checkbox"
              checked={catalog}
              onChange={(e) => {
                setCatalog(e.target.checked);
                setNotice("");
              }}
            />
            Gestionar catálogo
          </label>
          <small>En todas las sucursales</small>
        </div>
        <div className="branches-member-save">
          <Button
            type="submit"
            variant={dirty ? "default" : "outline"}
            disabled={busy || !dirty}
          >
            {busy ? <LoaderCircle className="animate-spin" /> : <Check />}
            {busy ? "Guardando…" : "Guardar"}
          </Button>
          {notice && !dirty && <small role="status">{notice}</small>}
        </div>
      </fieldset>
      {error && (
        <p role="alert" className="branches-error">
          {error}
        </p>
      )}
    </form>
  );
}
