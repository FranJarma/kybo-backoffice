"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Search,
  Settings2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OperationPanel } from "@/components/ui/operation-panel";
import { ItemPurchaseSettings } from "@/components/items/purchase-settings";
import { quantity } from "@/lib/number-format";
import type {
  SupplyAlert,
  SupplySnapshot,
} from "@/modules/supply-alerts/types";
import {
  purchaseAlerts,
  purchaseSeed,
  purchaseTiming,
  type PurchaseSeed,
} from "@/modules/supply-alerts/presentation";
import { getJson, today } from "./shared";
import { PurchaseCalculation } from "./purchase-calculation";

export function PurchaseNeeds({
  actorId,
  timeZone,
  onPrepare,
  initialConfigurationId,
  onBusy,
}: {
  actorId: string;
  timeZone: string;
  onPrepare: (lines: PurchaseSeed[]) => void;
  initialConfigurationId?: string;
  onBusy?: (busy: boolean) => void;
}) {
  const [data, setData] = useState<SupplySnapshot | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [detail, setDetail] = useState<SupplyAlert | null>(null),
    [editing, setEditing] = useState<string | null>(
      initialConfigurationId ?? null,
    ),
    [saving, setSaving] = useState(false),
    [preparing, setPreparing] = useState(false);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const ticket = ++generation.current;
    setLoading(true);
    try {
      const snapshot = await getJson<SupplySnapshot>(
        "/api/inventory/supply-alerts",
      );
      if (ticket === generation.current) {
        setData(snapshot);
        setError("");
      }
    } catch (e) {
      if (ticket === generation.current)
        setError(
          e instanceof Error
            ? e.message
            : "No pudimos consultar las necesidades.",
        );
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    return () => {
      clearTimeout(initial);
      // Numeric request version, not a DOM ref: invalidate reads on unmount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
    };
  }, [load]);
  useEffect(() => {
    onBusy?.(saving || preparing);
    return () => onBusy?.(false);
  }, [saving, preparing, onBusy]);
  const day = today(timeZone),
    alerts = purchaseAlerts(data?.alerts ?? []),
    actionable = alerts.filter((a) => a.status === "action"),
    missing = alerts.filter((a) => a.status === "needs_estimate"),
    covered = alerts.filter(
      (a) => a.status === "covered" && Number(a.incomingQuantity) > 0,
    );
  const rows = actionable.filter(
    (a) =>
      a.itemName.toLocaleLowerCase().includes(search.toLocaleLowerCase()) &&
      (filter === "all" ||
        (filter === "today"
          ? (a.orderBy ?? "") <= day
          : (a.orderBy ?? "") > day)),
  );
  const locked = loading || !!error || !data?.available;
  async function prepare(ids: string[]) {
    if (locked) return;
    const ticket = ++generation.current;
    setLoading(true);
    setPreparing(true);
    try {
      const fresh = await getJson<SupplySnapshot>(
        "/api/inventory/supply-alerts",
      );
      if (ticket !== generation.current) return;
      setData(fresh);
      const seed = purchaseSeed(
        fresh.alerts.filter((a) => ids.includes(a.itemId)),
      );
      if (!fresh.available || !seed.length) {
        setError(
          "La necesidad cambió. Actualizá para revisar las cantidades vigentes.",
        );
        return;
      }
      setDetail(null);
      onPrepare(seed);
    } catch (e) {
      if (ticket === generation.current)
        setError(
          e instanceof Error
            ? e.message
            : "No pudimos actualizar las cantidades.",
        );
    } finally {
      if (ticket === generation.current) {
        setLoading(false);
        setPreparing(false);
      }
    }
  }
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex max-w-3xl gap-3 rounded-r-lg border-l-4 border-primary bg-orange-50 px-4 py-4 text-brand">
          <Clock3 className="mt-1 size-5 shrink-0 text-orange-700" />
          <div>
            <h2 className="text-sm font-semibold">
              {actionable.length
                ? `${actionable.filter((a) => (a.orderBy ?? "") <= day).length} insumos necesitan un pedido hoy`
                : "Revisá las próximas compras"}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Se considera el stock disponible y lo que ya está pedido, según su
              llegada.
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          className="min-h-11"
          disabled={loading || saving}
          onClick={() => void load()}
        >
          <RefreshCw className="size-4" />
          Actualizar
        </Button>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      {loading && (
        <p role="status" className="text-sm text-muted-foreground">
          Consultando necesidades…
        </p>
      )}
      {data && !data.available && (
        <p role="status" className="rounded-lg bg-blue-50 p-4 text-sm">
          Los avisos de compra están pendientes de activación. Podés seguir
          registrando pedidos y recepciones.
        </p>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1" aria-label="Filtrar necesidades">
          {[
            ["all", "Todos"],
            ["today", "Pedir hoy"],
            ["later", "Próximos días"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              aria-pressed={filter === id}
              onClick={() => setFilter(id)}
              className={`min-h-11 rounded-lg border px-3 text-sm ${filter === id ? "border-line bg-white font-semibold text-brand" : "border-transparent text-muted-foreground"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="flex min-h-11 w-full items-center gap-2 rounded-lg border border-line bg-white px-3 sm:max-w-64">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <Input
            aria-label="Buscar un insumo"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar un insumo…"
            className="border-0 px-0 shadow-none"
          />
        </label>
      </div>
      <section
        aria-label="Insumos para comprar"
        className="overflow-hidden rounded-xl border border-line bg-white"
      >
        <div className="hidden grid-cols-[24px_minmax(180px,1.7fr)_repeat(3,minmax(75px,.6fr))_130px] items-center gap-4 border-b border-line bg-slate-50/70 px-5 py-4 text-xs font-medium text-muted-foreground lg:grid">
          <input
            type="checkbox"
            className="size-4 accent-primary"
            aria-label="Seleccionar todos"
            disabled={locked || !rows.length}
            checked={
              !!rows.length && rows.every((a) => selected.includes(a.itemId))
            }
            onChange={(e) =>
              setSelected(e.target.checked ? rows.map((a) => a.itemId) : [])
            }
          />
          <span>Insumo</span>
          <span>Disponible</span>
          <span>Ya pedido</span>
          <span>Comprar</span>
          <span>Cuándo</span>
        </div>
        {rows.map((a) => (
          <article
            key={a.itemId}
            className={`grid grid-cols-[24px_minmax(0,1fr)] items-start gap-4 border-b border-line px-4 py-5 last:border-b-0 sm:px-5 lg:grid-cols-[24px_minmax(180px,1.7fr)_repeat(3,minmax(75px,.6fr))_130px] lg:items-center ${selected.includes(a.itemId) ? "bg-orange-50/40" : ""}`}
          >
            <input
              type="checkbox"
              className="mt-1 size-4 accent-primary"
              aria-label={`Seleccionar ${a.itemName}`}
              checked={selected.includes(a.itemId)}
              disabled={locked}
              onChange={(e) =>
                setSelected((old) =>
                  e.target.checked
                    ? [...old, a.itemId]
                    : old.filter((id) => id !== a.itemId),
                )
              }
            />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold text-brand">{a.itemName}</h3>
              <p className="mt-1 text-xs text-muted-foreground">
                {a.dailyConsumption
                  ? `${quantity(a.dailyConsumption, a.baseUnit)} por día`
                  : "Falta estimar consumo"}
              </p>
            </div>
            <div className="col-start-2 grid grid-cols-3 gap-4 lg:contents">
              {[
                ["Disponible", a.availableQuantity],
                ["Ya pedido", a.incomingQuantity],
                ["Comprar", a.suggestedQuantity],
              ].map(([label, value]) => (
                <div key={label}>
                  <span className="mb-1 block text-xs text-muted-foreground lg:hidden">
                    {label}
                  </span>
                  <p
                    className={`text-base tabular-nums text-brand ${label === "Comprar" ? "font-bold" : "font-medium"}`}
                  >
                    {quantity(value)}
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {a.baseUnit === "unit" ? "unid." : a.baseUnit}
                  </span>
                </div>
              ))}
            </div>
            <div className="col-start-2 lg:col-auto">
              <span
                className={`inline-block rounded-md px-2 py-1 text-xs font-semibold ${a.urgency === "critical" ? "bg-red-50 text-red-800" : "bg-orange-50 text-orange-900"}`}
              >
                {purchaseTiming(a.orderBy, day)}
              </span>
            </div>
            <div className="col-start-2 flex flex-wrap justify-between gap-2 lg:col-span-5 lg:col-start-2 lg:justify-end">
              <button
                type="button"
                className="min-h-11 text-sm font-medium text-muted-foreground hover:text-blue-700"
                onClick={() => setDetail(a)}
              >
                Ver detalle
              </button>
              <Button
                variant="ghost"
                className="min-h-11 text-sm text-blue-700"
                disabled={locked}
                onClick={() => void prepare([a.itemId])}
              >
                Preparar pedido
                <ArrowRight className="size-4" />
              </Button>
            </div>
          </article>
        ))}
        {!rows.length && !loading && (
          <div className="px-5 py-10 text-center">
            <CheckCircle2 className="mx-auto size-7 text-blue-600" />
            <h3 className="mt-3 font-semibold text-brand">
              No hay insumos para comprar en esta vista
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {!data?.policies.length
                ? "Configurá la anticipación en la ficha de cada insumo para empezar."
                : "Los próximos avisos aparecerán según la anticipación y el consumo de cada insumo."}
            </p>
          </div>
        )}
      </section>
      {!!selected.length && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-brand px-5 py-3 text-white">
          <span className="text-sm font-semibold">
            {selected.length} insumo{selected.length === 1 ? "" : "s"}{" "}
            seleccionado{selected.length === 1 ? "" : "s"}
          </span>
          <Button
            className="min-h-11"
            disabled={locked}
            onClick={() => void prepare(selected)}
          >
            Preparar pedido
            <ArrowRight className="size-4" />
          </Button>
        </div>
      )}
      {!!missing.length && (
        <section className="rounded-lg border border-blue-200 bg-blue-50 p-4">
          <h2 className="text-sm font-semibold text-brand">
            Falta estimar el consumo
          </h2>
          {missing.map((a) => (
            <div
              key={a.itemId}
              className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span>{a.itemName}</span>
              <Button
                variant="ghost"
                className="min-h-11 text-blue-700"
                onClick={() => setEditing(a.itemId)}
              >
                Configurar insumo
              </Button>
            </div>
          ))}
        </section>
      )}
      {covered.map((a) => (
        <div
          key={a.itemId}
          className="flex flex-wrap items-center gap-3 border-t border-line py-4"
        >
          <CheckCircle2 className="size-5 text-emerald-700" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-brand">
              {a.itemName}: el pedido ya cubre la necesidad
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {quantity(a.incomingQuantity, a.baseUnit)} con fecha vigente.
            </p>
          </div>
          <Button
            variant="ghost"
            className="min-h-11 text-blue-700"
            onClick={() => setDetail(a)}
          >
            Ver detalle
          </Button>
        </div>
      ))}
      <p className="text-xs leading-relaxed text-muted-foreground">
        La anticipación se define por insumo en su ficha.{" "}
        <Link href="/inventory/items" className="font-semibold text-blue-700">
          Configurar insumos
        </Link>
      </p>
      {detail && (
        <OperationPanel
          title={detail.itemName}
          label="Necesidad de compra"
          description="Stock y previsión de la sucursal seleccionada."
          locked={loading}
          onClose={() => setDetail(null)}
          footer={
            <>
              <Button
                variant="outline"
                className="min-h-12"
                disabled={loading}
                onClick={() => setDetail(null)}
              >
                Cerrar
              </Button>
              {detail.status === "action" && (
                <Button
                  className="min-h-12 flex-1"
                  disabled={locked}
                  onClick={() => void prepare([detail.itemId])}
                >
                  Preparar pedido
                  <ArrowRight className="size-4" />
                </Button>
              )}
            </>
          }
        >
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <p className="text-sm text-muted-foreground">Cantidad sugerida</p>
          <p className="text-4xl font-bold text-brand">
            {quantity(detail.suggestedQuantity)}{" "}
            <span className="text-base font-normal">
              {detail.baseUnit === "unit" ? "unidades" : detail.baseUnit}
            </span>
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Tarda {detail.leadDays} días en llegar. Con {detail.safetyDays} días
            de margen, {purchaseTiming(detail.orderBy, day).toLowerCase()}.
          </p>
          <PurchaseCalculation alert={detail} />
          <Button
            variant="outline"
            className="min-h-12"
            disabled={loading}
            onClick={() => {
              setDetail(null);
              setEditing(detail.itemId);
            }}
          >
            <Settings2 className="size-4" />
            Configurar este insumo
          </Button>
        </OperationPanel>
      )}
      {editing && (
        <OperationPanel
          title={
            data?.items.find((i) => i.id === editing)?.name ??
            "Configurar insumo"
          }
          label="Ficha del insumo"
          description="Reposición y compras · sucursal seleccionada"
          onClose={() => setEditing(null)}
          locked={saving}
        >
          <ItemPurchaseSettings
            key={editing}
            itemId={editing}
            actorId={actorId}
            onBusy={setSaving}
            onSaved={() => void load()}
            onCancel={() => setEditing(null)}
          />
        </OperationPanel>
      )}
    </div>
  );
}
