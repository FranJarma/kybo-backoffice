"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getJson, useOperation } from "@/components/inventory/shared";
import { Button } from "@/components/ui/button";
import type { PrepSettings } from "@/modules/preparation/types";

export function ProductPreparationTab({
  productId,
  actorId,
  onBusy,
}: {
  productId: string;
  actorId: string;
  onBusy: (busy: boolean) => void;
}) {
  const [data, setData] = useState<PrepSettings>();
  const [stationId, setStationId] = useState("");
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [notice, setNotice] = useState("");
  const operation = useOperation(actorId, "preparation-settings", () => {
    setRefresh((n) => n + 1);
    setNotice("Estación guardada para la sucursal seleccionada.");
  });
  useEffect(() => {
    onBusy(operation.busy || operation.uncertain);
  }, [operation.busy, operation.uncertain, onBusy]);
  useEffect(() => {
    let live = true;
    getJson<PrepSettings>(`/api/preparation/settings?productId=${productId}`)
      .then((result) => {
        if (live) {
          setData(result);
          setStationId(result.products[0]?.stationId ?? "");
          setError("");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [productId, refresh]);
  const product = data?.products.find((p) => p.id === productId);
  const station = data?.stations.find((s) => s.id === stationId);
  const location = data?.locations.find(
    (l) => l.id === station?.consumptionLocationId,
  );
  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold text-brand">Dónde se prepara</h3>
        <p className="mt-2 text-sm text-muted">
          Esta asignación corresponde a la sucursal seleccionada en el header.
          Barra y Cocina reciben comandas; Caja toma pedidos y cobra.
        </p>
      </div>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <Button variant="outline" onClick={() => setRefresh((n) => n + 1)}>
            Reintentar
          </Button>
        </div>
      ) : !data ? (
        <p role="status">Cargando estaciones…</p>
      ) : !product ? (
        <p>No se pudo encontrar este producto activo.</p>
      ) : (
        <>
          <label className="block text-sm font-medium">
            Estación de preparación
            <select
              className="form-control mt-2"
              value={stationId}
              disabled={operation.locked}
              onChange={(e) => {
                setStationId(e.target.value);
                setNotice("");
              }}
            >
              <option value="">General (sin estación asignada)</option>
              {data.stations
                .filter((s) => !s.archived || s.id === product.stationId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.archived ? " (archivada)" : ""}
                  </option>
                ))}
            </select>
          </label>
          <p className="rounded-lg bg-surface p-4 text-sm">
            {location
              ? `Ubicación de consumo: ${location.name}. De aquí se toma el stock al finalizar la preparación.`
              : "La estación organiza el trabajo; la ubicación de consumo indica dónde está el stock."}
          </p>
          <Button
            disabled={
              operation.locked || stationId === (product.stationId ?? "")
            }
            onClick={() =>
              operation.submit("/api/preparation/settings/routes", {
                requestId: crypto.randomUUID(),
                productId,
                revision: product.revision,
                stationId: stationId || null,
              })
            }
          >
            Guardar preparación
          </Button>
        </>
      )}
      {operation.error && (
        <p role="alert" className="text-sm text-red-700">
          {operation.error}
        </p>
      )}
      {operation.status === 409 && !operation.uncertain && (
        <Button
          variant="outline"
          onClick={() => {
            operation.clearError();
            setRefresh((n) => n + 1);
            setNotice(
              "Se cargará la asignación actual. Volvé a elegir la estación antes de guardar.",
            );
          }}
        >
          Recargar asignación actual
        </Button>
      )}
      {operation.uncertain && (
        <Button
          variant="outline"
          disabled={operation.busy}
          onClick={operation.retry}
        >
          Confirmar guardado pendiente
        </Button>
      )}
      {notice && (
        <p role="status" className="text-sm text-emerald-800">
          {notice}
        </p>
      )}
      <p className="text-xs text-muted">
        Las estaciones y sus ubicaciones de consumo se administran en{" "}
        <Link className="text-blue-700 underline" href="/kitchen">
          Comandas → Configuración
        </Link>
        . Crear una ubicación llamada Barra no crea una estación
        automáticamente.
      </p>
    </div>
  );
}
