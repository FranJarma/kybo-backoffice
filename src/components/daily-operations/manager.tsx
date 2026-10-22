"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  RefreshCw,
  ClipboardList,
  Warehouse,
  History,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type {
  DailySnapshot,
  TaskRow,
  Urgency,
} from "@/modules/daily-operations/types";
import { TaskList, urgencyLabels, urgencyColors } from "./task-list";
import { TaskDetail } from "./task-detail";
import { StockByLocation } from "./stock-by-location";
const selectClass = "min-h-12 min-w-0 rounded-lg border bg-white px-3 text-sm";
export function DailyOperationsManager({
  actorId,
  role,
}: {
  actorId: string;
  role: string;
}) {
  const [data, setData] = useState<DailySnapshot | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [selected, setSelected] = useState<TaskRow | null>(null),
    [tab, setTab] = useState("tasks"),
    [mine, setMine] = useState(role === "staff"),
    [locationId, setLocationId] = useState(""),
    [assignedTo, setAssignedTo] = useState(""),
    [kind, setKind] = useState(""),
    [urgency, setUrgency] = useState<Urgency | "">(""),
    [offset, setOffset] = useState(0);
  const inFlight = useRef(false),
    generation = useRef(0),
    reconcileKey = useRef<string | null>(null);
  const load = useCallback(async () => {
    const ticket = ++generation.current;
    const q = new URLSearchParams({
      mine: String(mine),
      history: String(tab === "history"),
      offset: String(offset),
    });
    if (locationId) q.set("locationId", locationId);
    if (assignedTo) q.set("assignedTo", assignedTo);
    if (kind) q.set("kind", kind);
    if (urgency) q.set("urgency", urgency);
    const response = await fetch(`/api/operations/day?${q}`, {
        cache: "no-store",
      }),
      body = await response.json();
    if (!response.ok)
      throw new Error(body.error ?? "No pudimos consultar la operación.");
    if (ticket === generation.current) setData(body);
    return body as DailySnapshot;
  }, [mine, tab, offset, locationId, assignedTo, kind, urgency]);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    let issue = "";
    try {
      if (role !== "staff") {
        reconcileKey.current ??= crypto.randomUUID();
        try {
          const response = await fetch("/api/operations/day/reconcile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requestId: reconcileKey.current }),
          });
          const body = await response.json();
          if (response.ok) {
            reconcileKey.current = null;
          } else {
            if (response.status < 500) reconcileKey.current = null;
            issue = body.error ?? "No se pudieron actualizar las tareas.";
          }
        } catch {
          issue = "No se pudieron actualizar las tareas. Volvé a intentar.";
        }
      }
      await load();
      setError(issue);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No pudimos actualizar los datos.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }, [load, role]);
  useEffect(() => {
    void load().catch((e) => setError(e.message));
  }, [load]);
  useEffect(() => {
    void refresh();
    const id = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 60000);
    return () => clearInterval(id);
  }, [refresh]);
  const change = (fn: () => void) => {
    setOffset(0);
    fn();
  };
  const canManage = data?.canManage ?? role !== "staff";
  return (
    <div className="mx-auto max-w-7xl space-y-6 pb-8 text-brand">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b pb-5">
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Equipo · Reposición · Preparación
          </p>
          <h1 className="text-2xl font-bold sm:text-3xl">Operación del día</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {data?.businessDate
              ? new Date(`${data.businessDate}T12:00:00`).toLocaleDateString(
                  "es-AR",
                  { weekday: "long", day: "numeric", month: "long" },
                )
              : "Organizá lo que necesita tu sucursal."}
          </p>
        </div>
        <Button
          variant="outline"
          className="min-h-12 gap-2"
          disabled={busy}
          onClick={() => void refresh()}
        >
          <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
          {busy ? "Actualizando…" : "Actualizar"}
        </Button>
      </header>
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-orange-200 bg-orange-50 p-4 text-orange-950"
        >
          <AlertCircle className="size-5 shrink-0" />
          <div>
            <p className="font-semibold">
              La información necesita actualizarse
            </p>
            <p className="mt-1 text-sm">{error}</p>
            <p className="mt-1 text-sm">
              Las acciones quedan pausadas hasta recuperar datos vigentes.
            </p>
          </div>
        </div>
      )}
      {data?.configurationWarnings.map((w) => (
        <p
          key={w}
          className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-sm"
        >
          {w}
        </p>
      ))}
      <div className="flex flex-wrap gap-2 border-b pb-3">
        {[
          ["tasks", "Tareas", ClipboardList],
          ["stock", "Stock por ubicación", Warehouse],
          ["history", "Historial", History],
        ].map(([id, label, Icon]) => (
          <Button
            key={String(id)}
            variant={tab === id ? "secondary" : "ghost"}
            className="min-h-12 gap-2"
            onClick={() => change(() => setTab(String(id)))}
          >
            {typeof Icon !== "string" && <Icon className="size-4" />}
            {String(label)}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
        {canManage && tab !== "stock" && (
          <select
            aria-label="Vista de tareas"
            className={selectClass}
            value={mine ? "mine" : "team"}
            onChange={(e) => change(() => setMine(e.target.value === "mine"))}
          >
            <option value="team">Todo el equipo</option>
            <option value="mine">Mis tareas</option>
          </select>
        )}
        <select
          aria-label="Ubicación"
          className={selectClass}
          value={locationId}
          onChange={(e) => change(() => setLocationId(e.target.value))}
        >
          <option value="">Todas las ubicaciones</option>
          {data?.locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        {tab !== "stock" && (
          <>
            <select
              aria-label="Tipo de tarea"
              className={selectClass}
              value={kind}
              onChange={(e) => change(() => setKind(e.target.value))}
            >
              <option value="">Todas las tareas</option>
              <option value="transfer">Reposición</option>
              <option value="production">Preparación</option>
              <option value="purchase">Compras</option>
            </select>
            {canManage && !mine && (
              <select
                aria-label="Responsable"
                className={selectClass}
                value={assignedTo}
                onChange={(e) => change(() => setAssignedTo(e.target.value))}
              >
                <option value="">Todos los responsables</option>
                <option value="unassigned">Sin responsable</option>
                {data?.people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </>
        )}
      </div>
      {!data ? (
        <p className="py-10 text-center text-muted-foreground">
          {error
            ? "No hay datos disponibles para mostrar."
            : "Cargando operación…"}
        </p>
      ) : tab === "stock" ? (
        <StockByLocation rows={data.stock} locationId={locationId} />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2 sm:gap-4">
            {(["critical", "high", "scheduled"] as const).map((u) => (
              <button
                key={u}
                aria-pressed={urgency === u}
                onClick={() => change(() => setUrgency(urgency === u ? "" : u))}
                className={`min-h-24 rounded-xl border p-3 text-left ${urgencyColors[u]} ${urgency === u ? "ring-2 ring-brand ring-offset-2" : ""}`}
              >
                <span className="block text-2xl font-bold tabular-nums">
                  {data.summary[u]}
                </span>
                <span className="mt-1 block text-xs font-medium sm:text-sm">
                  {urgencyLabels[u]}
                </span>
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold">
              {tab === "history"
                ? "Tareas cerradas"
                : mine
                  ? "Mis tareas"
                  : "Qué hay que hacer"}
            </h2>
            <span className="text-sm text-muted-foreground">
              {data.total} tareas
              {urgency && (
                <button
                  className="ml-3 min-h-12 underline"
                  onClick={() => change(() => setUrgency(""))}
                >
                  Quitar prioridad
                </button>
              )}
            </span>
          </div>
          {data.tasks.length ? (
            <TaskList tasks={data.tasks} onSelect={setSelected} />
          ) : (
            <div className="rounded-xl border border-dashed p-8 text-center">
              <ClipboardList className="mx-auto mb-3 size-8 text-muted-foreground" />
              <p className="font-semibold">No hay tareas en esta vista</p>
              <p className="mt-2 text-sm text-muted-foreground">
                {data.configurationWarnings.length
                  ? "Configurá los mínimos para generar sugerencias de reposición."
                  : "Podés cambiar los filtros o actualizar para consultar nuevas necesidades."}
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button
              className="min-h-12"
              variant="outline"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 50))}
            >
              Anterior
            </Button>
            <Button
              className="min-h-12"
              variant="outline"
              disabled={offset + 50 >= data.total}
              onClick={() => setOffset(offset + 50)}
            >
              Siguiente
            </Button>
          </div>
        </>
      )}
      <footer className="flex flex-wrap justify-between gap-2 border-t pt-4 text-xs text-muted-foreground">
        <span>
          {data
            ? `Última consulta: ${new Date(data.asOf).toLocaleTimeString("es-AR")}`
            : ""}{" "}
          · Actualización cada minuto
        </span>
        {canManage && (
          <Link
            href="/sales"
            prefetch={false}
            className="flex min-h-12 items-center underline"
          >
            Configurar mínimos desde Reposición del punto de venta
          </Link>
        )}
      </footer>
      {selected && data && (
        <TaskDetail
          key={selected.id}
          task={selected}
          people={data.people}
          canManage={canManage}
          disabled={!!error}
          onClose={() => setSelected(null)}
          onRefresh={async () => {
            try {
              const fresh = await load();
              return fresh.tasks.find((t) => t.id === selected.id);
            } catch (e) {
              setError(
                "No pudimos actualizar la vista. Si la operación se confirmó, no hace falta volver a enviarla.",
              );
              throw e;
            }
          }}
        />
      )}
      <span className="sr-only">Sesión de {actorId}</span>
    </div>
  );
}
