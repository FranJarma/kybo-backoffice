"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Plus, Save, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getJson, useOperation } from "@/components/inventory/shared";
import {
  Control,
  selectClass,
  OperationNotice,
} from "@/components/sales/shared";
import type { PrepSettings, Station } from "@/modules/preparation/types";
export function PreparationSettings({
  actorId,
  onClose,
}: {
  actorId: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<PrepSettings | null>(null),
    [q, setQ] = useState(""),
    [includeArchived, setIncludeArchived] = useState(false),
    [offset, setOffset] = useState(0),
    [version, setVersion] = useState(0),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [name, setName] = useState(""),
    [locationId, setLocationId] = useState(""),
    [notice, setNotice] = useState("");
  const [draft, setDraft] = useState<Station | null>(null),
    [routes, setRoutes] = useState<Record<string, string>>({});
  const outcome = useRef("Configuración guardada.");
  const success = useCallback(() => {
    setNotice(outcome.current);
    setName("");
    setDraft(null);
    setRoutes({});
    setVersion((v) => v + 1);
  }, []);
  const operation = useOperation<Record<string, unknown>>(
    actorId,
    "preparation-settings",
    success,
  );
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      setLoading(true);
      getJson<PrepSettings>(
        `/api/preparation/settings?q=${encodeURIComponent(q)}&offset=${offset}&includeArchived=${includeArchived}`,
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
  }, [q, offset, version, includeArchived]);
  const locked = operation.locked || loading;
  function saveStation(archived = false) {
    if (locked) return;
    setNotice("");
    outcome.current = "Estación guardada.";
    operation.submit("/api/preparation/settings/stations", {
      requestId: crypto.randomUUID(),
      ...(draft ? { id: draft.id, revision: draft.revision } : {}),
      name: draft ? draft.name : name,
      consumptionLocationId: draft ? draft.consumptionLocationId : locationId,
      archived,
    });
  }
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Preparación</p>
          <h1 className="mt-1 text-2xl font-extrabold tracking-tight text-brand">
            Estaciones y productos
          </h1>
        </div>
        <Button variant="outline" disabled={operation.locked} onClick={onClose}>
          <ArrowLeft size={16} />
          Volver a comandas
        </Button>
      </div>
      <p className="max-w-3xl text-sm leading-relaxed text-muted">
        Elegí dónde se prepara cada producto. Cualquier persona puede cubrir
        varias estaciones; los productos sin asignar aparecen en General. Los
        cambios se aplican a los próximos pedidos.
      </p>
      <OperationNotice
        error={operation.error}
        uncertain={operation.uncertain}
        busy={operation.busy}
        retry={operation.retry}
      />
      {notice && (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
      <div className="grid items-start gap-5 xl:grid-cols-[330px_minmax(0,1fr)]">
        <div className="rounded-xl border border-line bg-white p-5">
          <h2 className="flex items-center gap-2 text-base font-bold text-brand">
            <Settings2 size={18} />
            Estaciones de trabajo
          </h2>
          <form
            className="mt-5 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              saveStation();
            }}
          >
            <Control label={draft ? "Nombre de estación" : "Nueva estación"}>
              <Input
                required
                maxLength={60}
                value={draft ? draft.name : name}
                disabled={locked}
                placeholder="Ej. Barra o Cocina"
                onChange={(e) =>
                  draft
                    ? setDraft({ ...draft, name: e.target.value })
                    : setName(e.target.value)
                }
              />
            </Control>
            <Control label="Ubicación de consumo">
              <select
                className={selectClass}
                value={draft ? (draft.consumptionLocationId ?? "") : locationId}
                onChange={(e) =>
                  draft
                    ? setDraft({
                        ...draft,
                        consumptionLocationId: e.target.value,
                      })
                    : setLocationId(e.target.value)
                }
                required
                disabled={locked}
              >
                <option value="">Elegí una ubicación</option>
                {data?.locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </Control>
            <Button
              className="w-full"
              disabled={locked || !(draft ? draft.name : name).trim()}
            >
              <Plus size={16} />
              {draft ? "Guardar estación" : "Crear estación"}
            </Button>
            {draft && (
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={locked}
                  onClick={() => setDraft(null)}
                >
                  Cancelar edición
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={locked}
                  onClick={() => saveStation(!draft.archived)}
                >
                  {draft.archived ? "Reactivar" : "Archivar"}
                </Button>
              </div>
            )}
          </form>
          <div className="mt-5 divide-y divide-line border-t border-line">
            <p className="py-3 text-xs text-muted">
              <strong className="text-brand">General</strong> · sin asignación
            </p>
            {data?.stations.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between gap-2 py-3"
              >
                <span className="min-w-0 break-words text-sm font-semibold text-brand">
                  {s.name}
                  {s.archived && (
                    <small className="ml-2 font-normal text-muted">
                      Archivada
                    </small>
                  )}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={locked}
                  onClick={() => {
                    setDraft(s);
                    setNotice("");
                  }}
                  aria-label={`Editar ${s.name}`}
                >
                  Editar
                </Button>
              </div>
            ))}
          </div>
        </div>
        <div className="min-w-0 overflow-hidden rounded-xl border border-line bg-white">
          <div className="border-b border-line p-5">
            <h2 className="text-base font-bold text-brand">
              ¿Dónde se prepara cada producto?
            </h2>
            <Input
              className="mt-4"
              aria-label="Buscar producto para asignar"
              placeholder="Buscar producto…"
              value={q}
              disabled={operation.locked}
              onChange={(e) => {
                setQ(e.target.value);
                setOffset(0);
                setNotice("");
              }}
            />
            <label className="mt-3 flex items-center gap-2 text-xs text-muted">
              <input
                type="checkbox"
                checked={includeArchived}
                disabled={operation.locked}
                onChange={(e) => {
                  setIncludeArchived(e.target.checked);
                  setOffset(0);
                }}
              />
              Mostrar productos archivados
            </label>
            {includeArchived && (
              <p className="mt-2 text-xs text-muted">
                Los archivados solo permiten quitar su estación; permanecen
                fuera de la carta.
              </p>
            )}
          </div>
          <div className="divide-y divide-line">
            {data?.products.map((p) => (
              <div
                key={p.id}
                className="grid items-center gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_170px_auto]"
              >
                <span className="min-w-0 break-words text-sm font-bold text-brand">
                  {p.name}
                  {p.archived && (
                    <small className="ml-2 font-normal text-muted">
                      Archivado
                    </small>
                  )}
                </span>
                <select
                  aria-label={`Estación para ${p.name}`}
                  className={selectClass}
                  value={routes[p.id] ?? p.stationId ?? ""}
                  disabled={locked}
                  onChange={(e) => {
                    setRoutes((r) => ({ ...r, [p.id]: e.target.value }));
                    setNotice("");
                  }}
                >
                  <option value="">General</option>
                  {data.stations
                    .filter(
                      (s) =>
                        !s.archived && (!p.archived || s.id === p.stationId),
                    )
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
                <Button
                  variant="outline"
                  aria-label={`Guardar ${p.name}`}
                  disabled={
                    locked ||
                    (routes[p.id] ?? p.stationId ?? "") === (p.stationId ?? "")
                  }
                  onClick={() => {
                    setNotice("");
                    outcome.current = "Asignación guardada.";
                    operation.submit("/api/preparation/settings/routes", {
                      requestId: crypto.randomUUID(),
                      productId: p.id,
                      revision: p.revision,
                      stationId: routes[p.id] || null,
                    });
                  }}
                >
                  <Save size={15} />
                  <span className="sm:sr-only">Guardar</span>
                </Button>
              </div>
            ))}
          </div>
          {data?.products.length === 0 && (
            <p className="p-6 text-sm text-muted">
              No hay productos para esta búsqueda.
            </p>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line p-4 text-xs text-muted">
            <span>
              {loading ? "Actualizando…" : `${data?.total ?? 0} productos`}
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={locked || offset === 0}
                onClick={() => setOffset(Math.max(0, offset - 30))}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={locked || offset + 30 >= (data?.total ?? 0)}
                onClick={() => setOffset(offset + 30)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
