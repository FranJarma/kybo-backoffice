"use client";
import { useState } from "react";
import Link from "next/link";
import {
  RefreshCw,
  ClipboardList,
  Warehouse,
  History,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import type { TaskRow } from "@/modules/daily-operations/types";
import { TaskList, urgencyLabels } from "./task-list";
import { TaskDetail } from "./task-detail";
import { StockByLocation } from "./stock-by-location";
import { DayFiltersBar, type DayFilters } from "./filters";
import { useDayFeed } from "./use-day-feed";

export function DailyOperationsManager({
  role,
}: {
  actorId: string;
  role: string;
}) {
  const [selected, setSelected] = useState<TaskRow | null>(null);
  const [tab, setTab] = useState("tasks");
  const [offset, setOffset] = useState(0);
  const [filters, setFilters] = useState<DayFilters>({
    mine: role === "staff",
    locationId: "",
    assignedTo: "",
    kind: "",
    urgency: "",
  });
  const query = new URLSearchParams({
    mine: String(filters.mine),
    history: String(tab === "history"),
    offset: String(offset),
  });
  if (filters.locationId) query.set("locationId", filters.locationId);
  if (!filters.mine && filters.assignedTo)
    query.set("assignedTo", filters.assignedTo);
  if (tab !== "stock" && filters.kind) query.set("kind", filters.kind);
  if (tab === "tasks" && filters.urgency) query.set("urgency", filters.urgency);
  const {
    data,
    metadata,
    loading,
    updating,
    busy,
    error,
    disabled,
    read,
    refresh,
  } = useDayFeed(query.toString(), role);
  const canManage = metadata?.canManage ?? role !== "staff";
  const timeZone =
    data?.timeZone ?? metadata?.timeZone ?? "America/Argentina/Buenos_Aires";
  const updateFilters = (patch: Partial<DayFilters>) => {
    setOffset(0);
    setFilters((current) => ({ ...current, ...patch }));
  };
  const resetFilters = () => {
    setOffset(0);
    setFilters({
      mine: role === "staff",
      locationId: "",
      assignedTo: "",
      kind: "",
      urgency: "",
    });
  };
  const activeFilters =
    !!filters.locationId ||
    (tab !== "stock" &&
      (!!filters.kind ||
        !!filters.assignedTo ||
        (role !== "staff" && filters.mine) ||
        (tab === "tasks" && !!filters.urgency)));
  const totalPriorities = data
    ? data.summary.critical + data.summary.high + data.summary.scheduled
    : 0;
  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-8 text-brand">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            Operación del día
          </h1>
          <p className="mt-2 text-sm text-muted">
            {metadata?.businessDate
              ? new Intl.DateTimeFormat("es-AR", {
                  weekday: "long",
                  day: "numeric",
                  month: "long",
                  timeZone: "UTC",
                }).format(new Date(`${metadata.businessDate}T12:00:00Z`))
              : "Organizá las tareas de tu sucursal."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <span role="status" className="text-xs text-muted">
            {error
              ? "La información necesita actualizarse"
              : updating || busy
                ? "Consultando necesidades…"
                : data
                  ? `Actualizado ${new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", timeZone }).format(new Date(data.asOf))}`
                  : ""}
          </span>
          <Button
            type="button"
            variant="outline"
            className="min-h-12"
            disabled={busy}
            onClick={() => void refresh()}
          >
            <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} />
            {busy ? "Actualizando…" : "Actualizar"}
          </Button>
        </div>
      </header>
      {error && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-950"
        >
          <AlertCircle className="size-5 shrink-0" />
          <div>
            <p className="font-semibold">No pudimos actualizar esta vista</p>
            <p className="mt-1 text-sm">{error}</p>
            <p className="mt-1 text-sm">
              Las acciones quedan pausadas hasta recuperar datos vigentes.
            </p>
          </div>
        </div>
      )}
      {!!metadata?.configurationWarnings.length && (
        <details className="rounded-xl border border-line bg-white px-4 py-1">
          <summary className="min-h-12 content-center cursor-pointer text-sm font-semibold text-blue">
            Revisar configuración de necesidades
          </summary>
          <ul className="space-y-2 pb-4 text-sm text-muted">
            {metadata.configurationWarnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </details>
      )}
      <Tabs.Root
        value={tab}
        onValueChange={(value) => {
          setOffset(0);
          setTab(value);
        }}
        className="space-y-5"
      >
        <Tabs.List aria-label="Operación del día">
          <Tabs.Trigger value="tasks">
            <ClipboardList className="size-4" />
            Tareas
          </Tabs.Trigger>
          <Tabs.Trigger value="stock">
            <Warehouse className="size-4" />
            Stock por ubicación
          </Tabs.Trigger>
          <Tabs.Trigger value="history">
            <History className="size-4" />
            Historial
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value={tab} className="space-y-4">
          {tab === "tasks" && (
            <div
              role="group"
              aria-label="Prioridad de las tareas"
              className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
            >
              {(["", "critical", "high", "scheduled"] as const).map(
                (urgency) => (
                  <Button
                    key={urgency}
                    type="button"
                    variant="outline"
                    className={`min-h-12 gap-2 ${filters.urgency === urgency ? "border-blue bg-blue-soft text-blue" : "bg-white"}`}
                    aria-pressed={filters.urgency === urgency}
                    onClick={() => updateFilters({ urgency })}
                  >
                    {urgency && (
                      <span
                        aria-hidden="true"
                        className={`size-2 rounded-full ${urgency === "critical" ? "bg-red-700" : urgency === "high" ? "bg-amber-700" : "bg-blue"}`}
                      />
                    )}
                    {urgency ? urgencyLabels[urgency] : "Todas"}
                    <span className="rounded bg-surface px-1.5 py-0.5 text-xs font-bold tabular-nums text-brand">
                      {data
                        ? urgency
                          ? data.summary[urgency]
                          : totalPriorities
                        : "—"}
                    </span>
                  </Button>
                ),
              )}
            </div>
          )}
          <DayFiltersBar
            value={filters}
            onChange={updateFilters}
            onReset={resetFilters}
            canManage={canManage}
            stock={tab === "stock"}
            people={metadata?.people ?? []}
            locations={metadata?.locations ?? []}
            active={activeFilters}
          />
          {loading ? (
            <div
              role="status"
              className="rounded-xl border border-line bg-white p-8 text-center text-sm text-muted"
            >
              Actualizando la vista…
            </div>
          ) : !data ? (
            <p className="py-8 text-center text-sm text-muted">
              No hay datos confirmados para esta vista. Volvé a actualizar.
            </p>
          ) : tab === "stock" ? (
            <StockByLocation
              rows={data.stock}
              locationId={filters.locationId}
              canManage={canManage}
            />
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-2 pt-1">
                <div>
                  <h2 className="text-lg font-bold">
                    {tab === "history"
                      ? "Tareas cerradas"
                      : filters.mine
                        ? "Mis tareas"
                        : "Qué hay que hacer"}
                  </h2>
                  <p className="mt-1 text-xs text-muted">
                    {tab === "history"
                      ? "Resultados de las tareas terminadas o cerradas."
                      : "Ordenadas por urgencia y fecha. Abrí una tarea para asignarla o continuar."}
                  </p>
                </div>
                <span className="text-sm tabular-nums text-muted">
                  {data.total} {data.total === 1 ? "tarea" : "tareas"}
                </span>
              </div>
              {data.tasks.length ? (
                <TaskList
                  tasks={data.tasks}
                  onSelect={setSelected}
                  timeZone={timeZone}
                  canManage={canManage}
                  disabled={disabled}
                />
              ) : (
                <div className="rounded-xl border border-line bg-white p-8 text-center">
                  <ClipboardList className="mx-auto mb-3 size-7 text-muted" />
                  <h3 className="font-bold">
                    {activeFilters
                      ? "No hay tareas con estos filtros"
                      : tab === "history"
                        ? "Todavía no hay tareas cerradas"
                        : "No hay tareas pendientes"}
                  </h3>
                  <p className="mx-auto mt-2 max-w-lg text-sm text-muted">
                    {activeFilters
                      ? "Probá otra ubicación, prioridad o responsable."
                      : data.configurationWarnings.length
                        ? "Revisá la configuración para detectar nuevas necesidades."
                        : "Las necesidades nuevas aparecerán al actualizar la operación."}
                  </p>
                  {activeFilters && (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-4 min-h-12"
                      onClick={resetFilters}
                    >
                      Ver todas las tareas
                    </Button>
                  )}
                </div>
              )}
              {(offset > 0 || offset + 50 < data.total) && (
                <nav
                  aria-label="Páginas de tareas"
                  className="flex flex-wrap items-center justify-between gap-3"
                >
                  <span className="text-sm tabular-nums text-muted">
                    Mostrando {offset + 1}–{Math.min(offset + 50, data.total)}{" "}
                    de {data.total}
                  </span>
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-12"
                      disabled={offset === 0}
                      onClick={() =>
                        setOffset((value) => Math.max(0, value - 50))
                      }
                    >
                      Página anterior
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="min-h-12"
                      disabled={offset + 50 >= data.total}
                      onClick={() => setOffset((value) => value + 50)}
                    >
                      Página siguiente
                    </Button>
                  </div>
                </nav>
              )}
            </>
          )}
        </Tabs.Content>
      </Tabs.Root>
      <footer className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-line pt-3 text-xs text-muted">
        <span>Actualización automática cada minuto</span>
        {canManage && (
          <div className="flex flex-wrap gap-4">
            <Link
              href="/inventory/purchases"
              prefetch={false}
              className="flex min-h-12 items-center font-semibold text-blue underline underline-offset-4"
            >
              Ir a Compras
            </Link>
            <Link
              href="/inventory/replenishment"
              prefetch={false}
              className="flex min-h-12 items-center font-semibold text-blue underline underline-offset-4"
            >
              Configurar mínimos en Inventario
            </Link>
          </div>
        )}
      </footer>
      {selected && metadata && (
        <TaskDetail
          key={selected.id}
          task={selected}
          latestTask={data?.tasks.find((task) => task.id === selected.id)}
          unavailable={
            !!data && !data.tasks.some((task) => task.id === selected.id)
          }
          people={metadata.people}
          canManage={canManage}
          disabled={disabled}
          timeZone={timeZone}
          onClose={() => setSelected(null)}
          onRefresh={async (reconcile = false) => {
            if (reconcile) await refresh();
            const fresh = await read();
            return fresh.tasks.find((task) => task.id === selected.id);
          }}
        />
      )}
    </div>
  );
}
