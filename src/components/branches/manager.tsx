"use client";

import { useEffect, useState } from "react";
import { Plus, Store, Clock3, Building2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SearchCombobox } from "@/components/ui/search-combobox";
import { OperationAlert } from "@/components/ui/operation-alert";
import { useErrorFeedback } from "@/components/ui/use-error-feedback";
import { getJson } from "@/components/inventory/shared";
import { BranchWorkspace } from "./workspace";
import { BranchAddress } from "./address";
import { CreateBranchDialog } from "./forms";
import { resolveBranchSelection, type BranchSummary } from "./presentation";
import "./branches.css";

export function BranchManager({
  admin,
  canEditCatalog,
  initialBranchId = "",
}: {
  admin: boolean;
  canEditCatalog: boolean;
  initialBranchId?: string;
}) {
  const [branches, setBranches] = useState<BranchSummary[]>([]);
  const [selected, setSelected] = useState(initialBranchId);
  const [loading, setLoading] = useState(true);
  const [version, setVersion] = useState(0);
  const [creating, setCreating] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError, errorAttempt] = useErrorFeedback();

  useEffect(() => {
    let live = true;
    getJson<{ rows: BranchSummary[] }>("/api/branches")
      .then(({ rows }) => {
        if (!live) return;
        setBranches(rows);
        setSelected((current) =>
          resolveBranchSelection(rows, current, initialBranchId),
        );
        setError("");
      })
      .catch(() => {
        if (live)
          setError(
            "No pudimos cargar las sucursales. Intentá actualizar el listado.",
          );
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [version, initialBranchId, setError]);

  const branch = branches.find((row) => row.id === selected);
  function refresh() {
    setLoading(true);
    setVersion((value) => value + 1);
  }

  return (
    <section className="branches-page">
      <header className="branches-heading">
        <div>
          <p className="eyebrow">Organización</p>
          <h1>Sucursales y ubicaciones</h1>
          <p>Organizá los espacios, el equipo y los productos de cada local.</p>
        </div>
        {admin && (
          <Button className="branches-action" onClick={() => setCreating(true)}>
            <Plus /> Crear sucursal
          </Button>
        )}
      </header>
      {error && (
        <OperationAlert
          eventKey={errorAttempt}
          tone="error"
          title="No pudimos cargar la información"
          message={error}
        />
      )}
      {notice && (
        <p role="status" className="branches-success">
          {notice}
        </p>
      )}
      <section
        className="branches-context"
        aria-label="Sucursal que estás administrando"
        aria-busy={loading}
      >
        <div className="branches-context-main">
          <span className="branches-context-icon">
            <Store aria-hidden="true" />
          </span>
          <div className="branches-context-selection">
            <label htmlFor="managed-branch">Sucursal a configurar</label>
            <SearchCombobox
              id="managed-branch"
              label="Sucursal a configurar"
              value={branch?.id ?? ""}
              selectedLabel={branch?.name ?? ""}
              options={branches}
              onSearch={() => {}}
              onChange={(id) => {
                if (id) {
                  setSelected(id);
                  setNotice("");
                }
              }}
              loading={loading}
              disabled={loading || branches.length < 2}
              placeholder={
                loading ? "Cargando sucursales…" : "Sin sucursales disponibles"
              }
            />
            {admin && branch && (
              <BranchAddress
                key={branch.id}
                branchId={branch.id}
                branchName={branch.name}
              />
            )}
          </div>
        </div>
        <div className="branches-context-meta">
          {branch && (
            <>
              <span>
                <Building2 aria-hidden="true" />
                <span>
                  <small>Código interno</small>
                  <strong>{branch.code}</strong>
                </span>
              </span>
              <span>
                <Clock3 aria-hidden="true" />
                <span>
                  <small>Zona horaria</small>
                  <strong>
                    {branch.timeZone.split("/").at(-1)?.replaceAll("_", " ")}
                  </strong>
                  <small className="branches-timezone">{branch.timeZone}</small>
                </span>
              </span>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            aria-label="Actualizar sucursales"
            disabled={loading}
            onClick={refresh}
          >
            <RefreshCw className={loading ? "animate-spin" : ""} />
          </Button>
        </div>
      </section>
      {branch ? (
        <BranchWorkspace
          key={branch.id}
          branch={branch}
          admin={admin}
          canEditCatalog={canEditCatalog}
          onArchived={() => {
            setBranches((rows) => rows.filter((row) => row.id !== branch.id));
            setSelected("");
            setNotice("Sucursal archivada. Se conserva su historial.");
            refresh();
          }}
        />
      ) : !loading && !error ? (
        <div className="branches-empty">
          <Store />
          <h2>Creá tu primera sucursal</h2>
          <p>Después podés agregar sus ubicaciones y habilitar al equipo.</p>
        </div>
      ) : loading ? (
        <p role="status" className="branches-loading">
          Cargando información de la sucursal…
        </p>
      ) : null}
      {creating && (
        <CreateBranchDialog
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            setSelected(id);
            setNotice(
              "Sucursal creada. Ya podés configurar sus ubicaciones, accesos y productos.",
            );
            refresh();
          }}
        />
      )}
    </section>
  );
}
