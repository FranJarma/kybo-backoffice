"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ListChecks,
  Settings2,
  ChartNoAxesCombined,
  RefreshCw,
  Wifi,
  WifiOff,
  Clock3,
  ChefHat,
  CheckCheck,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { today, useOperation } from "@/components/inventory/shared";
import {
  Control,
  selectClass,
  OperationNotice,
} from "@/components/sales/shared";
import type { Actor } from "@/lib/access";
import type {
  PrepTask,
  PrepDetail,
  PrepStatus,
} from "@/modules/preparation/types";
import { PrepCard } from "./card";
import { usePreparationFeed } from "./use-feed";
import { PreparationSettings } from "./settings";
import { PrepDetailDialog } from "./detail";
import { PrepMetricsPanel } from "./metrics";
const columns = [
  {
    status: "pending",
    label: "Pendientes",
    short: "Pendientes",
    icon: Clock3,
    color: "bg-amber-400",
  },
  {
    status: "preparing",
    label: "En preparación",
    short: "En curso",
    icon: ChefHat,
    color: "bg-blue",
  },
  {
    status: "ready",
    label: "Listos para entregar",
    short: "Listos",
    icon: CheckCheck,
    color: "bg-emerald-500",
  },
] as const;
export function PreparationBoard({
  actorId,
  role,
  initialSale,
}: {
  actorId: string;
  role: Actor["role"];
  initialSale?: string;
}) {
  const [mode, setMode] = useState<"board" | "settings" | "metrics">("board"),
    [scope, setScope] = useState("active"),
    [stationId, setStation] = useState(""),
    [mine, setMine] = useState(false),
    [filtersOpen, setFiltersOpen] = useState(false),
    [origin, setOrigin] = useState(""),
    [date, setDate] = useState(today),
    [saleId, setSaleId] = useState(initialSale ?? ""),
    [offset, setOffset] = useState(0),
    [refresh, setRefresh] = useState(0),
    [mobile, setMobile] = useState<PrepStatus>("pending"),
    [detail, setDetail] = useState<string | null>(null),
    [notice, setNotice] = useState("");
  const params = new URLSearchParams({
    scope,
    mine: String(mine),
    offset: String(offset),
  });
  if (stationId) params.set("stationId", stationId);
  if (origin) params.set("origin", origin);
  if (saleId) params.set("saleId", saleId);
  if (scope === "history") params.set("date", date);
  const feed = usePreparationFeed(`/api/preparation?${params}`, refresh);
  const success = useCallback((result: unknown) => {
    const { task } = result as PrepDetail;
    setNotice(
      task.status === "preparing"
        ? "Preparación confirmada."
        : task.status === "ready"
          ? "Tarea lista para entregar."
          : task.status === "delivered"
            ? "Entrega registrada."
            : "Estado actualizado.",
    );
    setRefresh((v) => v + 1);
  }, []);
  const operation = useOperation<Record<string, unknown>>(
    actorId,
    "preparation",
    success,
  );
  useEffect(() => {
    if (operation.status === 409) {
      const t = setTimeout(() => setRefresh((v) => v + 1), 0);
      return () => clearTimeout(t);
    }
  }, [operation.status]);
  const manager = role !== "staff",
    locked = operation.locked || !feed.fresh;
  function act(
    t: PrepTask,
    action: string,
    extra: Record<string, unknown> = {},
  ) {
    if (locked) return;
    setNotice("");
    operation.submit(`/api/preparation/${t.id}`, {
      requestId: crypto.randomUUID(),
      revision: t.revision,
      action,
      ...extra,
    });
  }
  function closePanel() {
    setMode("board");
    setRefresh((v) => v + 1);
  }
  if (mode === "settings" && manager)
    return <PreparationSettings actorId={actorId} onClose={closePanel} />;
  if (mode === "metrics" && manager)
    return <PrepMetricsPanel onClose={closePanel} />;
  const data = feed.data;
  const card = (t: PrepTask) => (
    <PrepCard
      key={t.id}
      task={t}
      actorId={actorId}
      locked={locked}
      now={feed.now}
      onAct={act}
      onDetail={setDetail}
    />
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#fff0dd] text-accent">
            <ListChecks size={23} />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-brand">
              Comandas
            </h1>
            <p className="mt-1 text-xs text-muted">
              Un mismo pedido, todo el equipo conectado.
            </p>
          </div>
        </div>
        {manager && (
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={operation.locked}
              onClick={() => setMode("metrics")}
            >
              <ChartNoAxesCombined size={16} />
              <span>Resumen del día</span>
            </Button>
            <Button
              variant="outline"
              disabled={operation.locked}
              onClick={() => setMode("settings")}
            >
              <Settings2 size={16} />
              Estaciones
            </Button>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-white px-4 py-3">
        <div
          role="status"
          className={cn(
            "flex min-w-0 items-start gap-2 text-xs",
            feed.fresh ? "text-emerald-700" : "text-amber-800",
          )}
        >
          {feed.fresh ? (
            <Wifi size={15} className="shrink-0" />
          ) : (
            <WifiOff size={15} className="shrink-0" />
          )}
          <span>
            {feed.fresh
              ? `Cola actualizada · hace ${feed.ageSeconds ?? 0} s`
              : feed.error ||
                (data
                  ? "La cola necesita actualizarse. Las acciones están en pausa."
                  : "Conectando con la cola…")}
          </span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setRefresh((v) => v + 1)}
          disabled={operation.busy}
        >
          <RefreshCw size={14} />
          Actualizar
        </Button>
      </div>
      <OperationNotice
        error={operation.error}
        uncertain={operation.uncertain}
        busy={operation.busy}
        retry={operation.retry}
      />
      {notice && (
        <p role="status" className="text-xs font-semibold text-emerald-800">
          {notice}
        </p>
      )}
      <section className="rounded-xl border border-line bg-white p-4">
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-2 sm:border-b sm:border-line sm:pb-4",
            filtersOpen && "border-b border-line pb-4",
          )}
        >
          <div
            className="flex rounded-lg bg-surface p-1"
            aria-label="Estado de comandas"
          >
            {[
              ["active", "Activas"],
              ["history", "Finalizadas"],
            ].map(([value, label]) => (
              <Button
                key={value}
                size="sm"
                variant="ghost"
                aria-pressed={scope === value}
                className={cn(
                  "px-5",
                  scope === value && "bg-white font-bold text-brand shadow-sm",
                )}
                onClick={() => {
                  setScope(value);
                  setOffset(0);
                  setNotice("");
                }}
              >
                {label}
              </Button>
            ))}
          </div>
          <Button
            className="sm:hidden"
            variant="ghost"
            size="sm"
            aria-expanded={filtersOpen}
            aria-controls="prep-filters"
            onClick={() => setFiltersOpen((v) => !v)}
          >
            Filtros{stationId || origin || mine ? " · activos" : ""}
          </Button>
          <label className="hidden min-h-10 cursor-pointer items-center gap-2 text-xs font-semibold text-muted sm:flex">
            <input
              type="checkbox"
              className="h-4 w-4 accent-blue"
              checked={mine}
              onChange={(e) => {
                setMine(e.target.checked);
                setOffset(0);
              }}
            />
            Solo mis tareas
          </label>
        </div>
        <div
          id="prep-filters"
          className={cn(
            "mt-4 gap-3",
            filtersOpen ? "grid" : "hidden sm:grid",
            scope === "history" ? "sm:grid-cols-3" : "sm:grid-cols-2",
          )}
        >
          <label className="flex min-h-10 items-center gap-2 text-xs font-semibold text-muted sm:hidden">
            <input
              type="checkbox"
              className="h-4 w-4 accent-blue"
              checked={mine}
              onChange={(e) => {
                setMine(e.target.checked);
                setOffset(0);
              }}
            />
            Solo mis tareas
          </label>
          <Control label="Estación">
            <select
              className={selectClass}
              value={stationId}
              onChange={(e) => {
                setStation(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">Todas las estaciones</option>
              <option value="general">General</option>
              {data?.stations
                .filter((s) => scope === "history" || !s.archived)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                    {s.archived ? " · archivada" : ""}
                  </option>
                ))}
            </select>
          </Control>
          <Control label="Origen">
            <select
              className={selectClass}
              value={origin}
              onChange={(e) => {
                setOrigin(e.target.value);
                setOffset(0);
              }}
            >
              <option value="">Todos los pedidos</option>
              <option value="counter">Mostrador</option>
              <option value="table">Mesas</option>
              <option value="delivery">Delivery</option>
            </select>
          </Control>
          {scope === "history" && (
            <Control label="Fecha comercial">
              <Input
                type="date"
                required
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setOffset(0);
                }}
              />
            </Control>
          )}
        </div>
        {saleId && (
          <div className="mt-3 flex items-center gap-2 text-xs text-blue">
            <span>Mostrando la venta seleccionada</span>
            <Button
              variant="ghost"
              size="sm"
              aria-label="Quitar filtro de venta"
              onClick={() => {
                setSaleId("");
                setOffset(0);
                window.history.replaceState(null, "", "/kitchen");
              }}
            >
              <X size={14} />
            </Button>
          </div>
        )}
      </section>
      {scope === "active" && (
        <div
          className="grid grid-cols-3 gap-2 xl:hidden"
          aria-label="Etapas de preparación"
        >
          {columns.map((c) => (
            <button
              key={c.status}
              type="button"
              aria-pressed={mobile === c.status}
              onClick={() => setMobile(c.status)}
              className={cn(
                "flex min-h-12 items-center justify-center gap-1.5 rounded-lg border px-1 text-xs font-bold",
                mobile === c.status
                  ? "border-brand bg-brand text-white"
                  : "border-line bg-white text-muted",
              )}
            >
              {c.short}
              <span
                className={cn(
                  "rounded px-1.5 py-0.5 text-[11px] tabular-nums",
                  mobile === c.status ? "bg-white/15" : "bg-surface",
                )}
              >
                {data?.counts[c.status] ?? 0}
              </span>
            </button>
          ))}
        </div>
      )}
      {!data ? (
        <div className="rounded-xl border border-line bg-white p-8 text-center text-sm text-muted">
          Cargando comandas…
        </div>
      ) : data.total === 0 ? (
        <div className="rounded-xl border border-dashed border-line bg-white px-6 py-14 text-center">
          <ListChecks size={30} className="mx-auto mb-3 text-blue" />
          <h2 className="text-base font-bold text-brand">
            No hay tareas para estos filtros.
          </h2>
          <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-muted">
            Las nuevas ventas aparecerán acá al confirmarse. Cada estación ve su
            parte del pedido.
          </p>
        </div>
      ) : scope === "active" ? (
        <div className="grid items-start gap-4 xl:grid-cols-3">
          {columns.map((c) => (
            <section
              key={c.status}
              className={cn(
                "min-w-0",
                mobile !== c.status && "hidden xl:block",
              )}
            >
              <div className="mb-3 flex items-center gap-2 px-1">
                <span className={cn("h-2 w-2 rounded-full", c.color)} />
                <h2 className="text-sm font-extrabold text-brand">{c.label}</h2>
                <span className="ml-auto rounded-md bg-white px-2 py-1 text-xs font-bold tabular-nums text-muted">
                  {data.counts[c.status]}
                </span>
              </div>
              <div className="space-y-3">
                {data.rows.filter((t) => t.status === c.status).map(card)}
                {!data.rows.some((t) => t.status === c.status) && (
                  <p className="rounded-xl border border-dashed border-line px-4 py-8 text-center text-xs text-muted">
                    Sin tareas en esta página.
                  </p>
                )}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="grid items-start gap-4 md:grid-cols-2 xl:grid-cols-3">
          {data.rows.map(card)}
        </div>
      )}
      {data && data.total > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <span>
            {offset + 1}–{Math.min(offset + 30, data.total)} de {data.total}{" "}
            tareas · ordenadas por ingreso
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - 30))}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={offset + 30 >= data.total}
              onClick={() => setOffset(offset + 30)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
      <p className="text-[11px] leading-relaxed text-muted">
        La cola se actualiza con la pantalla abierta. Registrar preparación
        todavía no descuenta insumos del inventario.
      </p>
      {detail && (
        <PrepDetailDialog
          id={detail}
          manager={manager}
          refresh={refresh}
          locked={locked}
          onClose={() => setDetail(null)}
          onTransfer={(t, id, reason) =>
            act(t, "reassign", { assigneeId: id, reason })
          }
          operationNotice={
            <OperationNotice
              error={operation.error}
              uncertain={operation.uncertain}
              busy={operation.busy}
              retry={operation.retry}
            />
          }
        />
      )}
    </div>
  );
}
