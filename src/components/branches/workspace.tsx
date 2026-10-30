"use client";

import { useEffect, useState } from "react";
import { Tabs } from "radix-ui";
import {
  Archive,
  Info,
  MapPin,
  Package,
  Plus,
  RefreshCw,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getJson } from "@/components/inventory/shared";
import { BranchMembers } from "./members";
import { BranchProductSettings } from "./product-settings";
import { ArchiveDialog, CreateLocationDialog } from "./forms";
import type { BranchLocation, BranchSummary } from "./presentation";

const panels = [
  { id: "locations", label: "Ubicaciones", icon: MapPin },
  { id: "members", label: "Equipo y accesos", icon: Users },
  { id: "products", label: "Productos", icon: Package },
];

export function BranchWorkspace({
  branch,
  admin,
  canEditCatalog,
  onArchived,
}: {
  branch: BranchSummary;
  admin: boolean;
  canEditCatalog: boolean;
  onArchived: () => void;
}) {
  const [locations, setLocations] = useState<BranchLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState("locations");
  const [visited, setVisited] = useState(["locations"]);
  const [creating, setCreating] = useState(false);
  const [archive, setArchive] = useState<BranchLocation | "branch" | null>(
    null,
  );
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let live = true;
    getJson<{ rows: BranchLocation[] }>(`/api/branches/${branch.id}/locations`)
      .then(({ rows }) => {
        if (live) {
          setLocations(rows);
          setError("");
        }
      })
      .catch(() => {
        if (live)
          setError(
            "No pudimos cargar las ubicaciones. Actualizá para volver a intentar.",
          );
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [branch.id, version]);

  function reload() {
    setLoading(true);
    setError("");
    setVersion((v) => v + 1);
  }
  async function confirmArchive() {
    if (!archive) return;
    const isBranch = archive === "branch";
    const response = await fetch(
      `/api/branches/${branch.id}${isBranch ? "" : "/locations"}`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isBranch
            ? { revision: branch.revision }
            : { locationId: archive.id, revision: archive.revision },
        ),
      },
    );
    const result = await response.json();
    if (!response.ok)
      throw new Error(
        result.error ?? "No pudimos archivar. Actualizá antes de reintentar.",
      );
    setArchive(null);
    if (isBranch) onArchived();
    else {
      setNotice("Ubicación archivada. Se conserva su historial.");
      reload();
    }
  }

  return (
    <>
      <Tabs.Root
        className="branches-workspace"
        value={tab}
        onValueChange={(value) => {
          setTab(value);
          setVisited((current) =>
            current.includes(value) ? current : [...current, value],
          );
        }}
      >
        <Tabs.List
          className="branches-tabs"
          aria-label="Configuración de la sucursal"
        >
          {panels
            .filter((panel) => admin || panel.id !== "members")
            .map(({ id, label, icon: Icon }) => (
              <Tabs.Trigger className="branches-tab" key={id} value={id}>
                <Icon aria-hidden="true" />
                {label}
                {id === "locations" && !loading && !error && (
                  <span>{locations.length}</span>
                )}
              </Tabs.Trigger>
            ))}
        </Tabs.List>
        <Tabs.Content className="branches-panel" value="locations" forceMount>
          <div className="branches-section-heading">
            <div>
              <p className="branches-kicker">Inventario por espacio</p>
              <h2>Ubicaciones de la sucursal</h2>
              <p>Definí dónde guardás, preparás o despachás la mercadería.</p>
            </div>
            {admin && (
              <Button
                className="branches-action"
                disabled={loading || !!error}
                onClick={() => setCreating(true)}
              >
                <Plus />
                Agregar ubicación
              </Button>
            )}
          </div>
          {notice && (
            <p role="status" className="branches-success">
              {notice}
            </p>
          )}
          {error ? (
            <div role="alert" className="branches-error">
              {error}
              <Button variant="outline" onClick={reload}>
                <RefreshCw />
                Reintentar
              </Button>
            </div>
          ) : loading ? (
            <div className="branches-loading" role="status">
              Cargando ubicaciones…
            </div>
          ) : locations.length ? (
            <div className="branches-location-list">
              <div className="branches-location-head">
                <span>Ubicación</span>
                <span>Estado</span>
                <span className="sr-only">Acciones</span>
              </div>
              {locations.map((location) => (
                <div className="branches-location-row" key={location.id}>
                  <div className="branches-location-name">
                    <span className="branches-location-icon">
                      <MapPin aria-hidden="true" />
                    </span>
                    <strong>{location.name}</strong>
                  </div>
                  <span className="branches-status active">
                    <span />
                    Activa
                  </span>
                  {admin && (
                    <Button
                      variant="outline"
                      className="branches-archive-button"
                      aria-label={`Archivar ${location.name}`}
                      onClick={() => setArchive(location)}
                    >
                      <Archive />
                      Archivar
                    </Button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="branches-empty">
              <MapPin />
              <h3>Todavía no hay ubicaciones</h3>
              <p>
                Agregá Barra, Cocina o Depósito para organizar las existencias.
              </p>
            </div>
          )}
          <div className="branches-info">
            <Info aria-hidden="true" />
            <p>
              Cada ubicación tiene su propio stock. Crear una ubicación no mueve
              mercadería; los movimientos se registran desde Inventario →
              Traslados.
            </p>
          </div>
        </Tabs.Content>
        {admin && visited.includes("members") && (
          <Tabs.Content className="branches-panel" value="members" forceMount>
            <BranchMembers branchId={branch.id} />
          </Tabs.Content>
        )}
        {visited.includes("products") && (
          <Tabs.Content className="branches-panel" value="products" forceMount>
            <BranchProductSettings
              branchId={branch.id}
              locations={locations}
              locationsReady={!loading && !error}
              locationsError={error}
              onReloadLocations={reload}
              canEditCatalog={canEditCatalog}
            />
          </Tabs.Content>
        )}
      </Tabs.Root>
      {admin && (
        <details className="branches-advanced">
          <summary>Opciones de la sucursal</summary>
          <div>
            <div>
              <strong>Archivar {branch.name}</strong>
              <p>
                Se conserva el historial. Requiere resolver existencias y
                operaciones pendientes.
              </p>
            </div>
            <Button variant="outline" onClick={() => setArchive("branch")}>
              <Archive />
              Archivar sucursal
            </Button>
          </div>
        </details>
      )}
      {creating && (
        <CreateLocationDialog
          branchId={branch.id}
          branchName={branch.name}
          onClose={() => setCreating(false)}
          onCreated={() => {
            setCreating(false);
            setNotice("Ubicación agregada a la sucursal.");
            reload();
          }}
        />
      )}
      {archive && (
        <ArchiveDialog
          name={archive === "branch" ? branch.name : archive.name}
          branch={archive === "branch"}
          onClose={() => setArchive(null)}
          onConfirm={confirmArchive}
        />
      )}
    </>
  );
}
