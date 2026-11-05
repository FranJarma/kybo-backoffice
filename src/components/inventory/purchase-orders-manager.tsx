"use client";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Plus, RefreshCw, Truck, ArrowUpRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OperationAlert } from "@/components/ui/operation-alert";
import { OperationNotice } from "@/components/sales/shared";
import type {
  PurchaseOrder,
  OrderSnapshot,
  CreateOrderInput,
  OrderCommand,
} from "@/modules/procurement/types";
import { getJson, useOperation, date, today } from "./shared";
import { PurchaseOrderEditor } from "./purchase-order-editor";
import { PurchaseOrderDetail, OrderStatus } from "./purchase-order-detail";
import { PurchasesManager } from "./purchases-manager";
import { OperationPanel } from "@/components/ui/operation-panel";
import type { PurchaseSeed } from "@/modules/supply-alerts/presentation";
const endpoint = "/api/procurement/orders";
export function PurchaseOrdersManager({
  actorId,
  timeZone,
  initialOrderId = "",
  initialDraft,
  embedded = false,
  onBusy,
  active = true,
}: {
  actorId: string;
  timeZone: string;
  initialOrderId?: string;
  initialDraft?: PurchaseSeed[];
  embedded?: boolean;
  onBusy?: (busy: boolean) => void;
  active?: boolean;
}) {
  const [data, setData] = useState<OrderSnapshot | null>(null),
    [selected, setSelected] = useState(initialDraft ? "" : initialOrderId),
    [editing, setEditing] = useState(!!initialDraft),
    [receiving, setReceiving] = useState<PurchaseOrder | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true),
    [filter, setFilter] = useState("open"),
    [search, setSearch] = useState(""),
    [advanceBusy, setAdvanceBusy] = useState(false);
  const generation = useRef(0);
  const formId = useId();
  const load = useCallback(async () => {
    const ticket = ++generation.current;
    setLoading(true);
    try {
      const snapshot = await getJson<OrderSnapshot>(endpoint);
      // A deep link remains usable even when an old order is outside the recent list.
      if (
        initialOrderId &&
        snapshot.available &&
        !snapshot.orders.some((o) => o.id === initialOrderId)
      ) {
        const detail = await getJson<{ order: PurchaseOrder }>(
          `${endpoint}/${initialOrderId}`,
        );
        snapshot.orders.push(detail.order);
      }
      if (ticket === generation.current) {
        setData(snapshot);
        setError("");
      }
    } catch (e) {
      if (ticket === generation.current)
        setError(
          e instanceof Error ? e.message : "No pudimos consultar los pedidos.",
        );
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }, [initialOrderId]);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => void load(), 0);
    return () => {
      clearTimeout(timer);
      // Numeric generation invalidates the latest request, rather than a DOM node.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
    };
  }, [load, active]);
  const saved = useCallback(
    (result: unknown) => {
      const o = (result as { result: PurchaseOrder }).result;
      setEditing(false);
      setSelected(o.id);
      setData((previous) =>
        previous
          ? {
              ...previous,
              orders: [o, ...previous.orders.filter((r) => r.id !== o.id)],
            }
          : previous,
      );
      setNotice(
        o.state === "draft"
          ? "Borrador guardado. Confirmalo cuando el proveedor tenga el pedido."
          : "Pedido actualizado. Operación del día lo toma al actualizar.",
      );
      void load();
    },
    [load],
  );
  const operation = useOperation<CreateOrderInput | OrderCommand>(
    actorId,
    "purchase-orders",
    saved,
  );
  const commandLocked = operation.locked || advanceBusy;
  const locked = loading || !!error || commandLocked || !data?.available;
  useEffect(() => {
    onBusy?.(commandLocked || editing || !!receiving);
    return () => onBusy?.(false);
  }, [commandLocked, editing, receiving, onBusy]);
  const order = data?.orders.find((o) => o.id === selected);
  if (receiving)
    return (
      <PurchasesManager
        key={`${receiving.id}:${receiving.revision}`}
        actorId={actorId}
        timeZone={timeZone}
        order={receiving}
        embedded={embedded}
        onOrderReceived={() => void load()}
        onOrderClose={() => {
          setReceiving(null);
          void load();
        }}
      />
    );
  const rows = [...(data?.orders ?? [])]
    .filter(
      (o) => filter === "all" || !["received", "cancelled"].includes(o.state),
    )
    .filter((o) =>
      `${o.supplierName} ${o.lines.map((l) => l.itemName).join(" ")}`
        .normalize("NFD")
        .replace(/\p{M}/gu, "")
        .toLocaleLowerCase("es")
        .includes(
          search
            .normalize("NFD")
            .replace(/\p{M}/gu, "")
            .toLocaleLowerCase("es")
            .trim(),
        ),
    )
    .sort((a, b) => {
      const rank = (o: PurchaseOrder) =>
        ["received", "cancelled"].includes(o.state)
          ? 3
          : o.state === "draft"
            ? 2
            : !o.expectedOn || o.expectedOn < today(timeZone)
              ? 0
              : 1;
      return (
        rank(a) - rank(b) ||
        (a.expectedOn ?? "9999").localeCompare(b.expectedOn ?? "9999")
      );
    });
  return (
    <div className="space-y-6 text-brand">
      <header className="page-heading">
        <div>
          {embedded ? (
            <h2 className="text-lg font-semibold">
              Pedidos y entregas pendientes
            </h2>
          ) : (
            <h1 className="page-title">Pedidos a proveedores</h1>
          )}
          <p className="page-description">
            Anotá lo que ya pediste, cuándo llega y cuánto falta recibir.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            className="min-h-12"
            disabled={loading || commandLocked}
            onClick={() => void load()}
          >
            <RefreshCw className="size-4" />
            Actualizar
          </Button>
          {!embedded && (
            <Button
              className="min-h-12"
              disabled={locked || editing}
              onClick={() => {
                setEditing(true);
                setSelected("");
                setNotice("");
              }}
            >
              <Plus className="size-4" />
              Nuevo pedido
            </Button>
          )}
        </div>
      </header>
      {loading && (
        <p role="status" className="text-sm text-muted">
          {data ? "Actualizando pedidos…" : "Consultando pedidos…"}
        </p>
      )}
      {error && !editing && !order && (
        <p
          role="alert"
          className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
        >
          {error} La información anterior se conserva; actualizá antes de
          registrar una llegada.
        </p>
      )}
      {!editing && !order && (
        <OperationAlert
          tone="error"
          title="No pudimos consultar los pedidos"
          message={error}
        />
      )}
      {!editing && !order && (
        <OperationNotice
          error={operation.error}
          eventKey={operation.errorAttempt}
          uncertain={operation.uncertain}
          busy={operation.busy}
          retry={operation.retry}
        />
      )}
      {operation.status === 409 && (
        <p className="text-sm">
          El pedido pudo cambiar en otra pantalla. Actualizá antes de volver a
          confirmar.
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg bg-blue-50 p-4 text-sm">
          {notice}
        </p>
      )}
      {data && !data.available && (
        <p
          role="status"
          className="rounded-lg border border-blue-200 bg-blue-50 p-5 text-sm"
        >
          Los pedidos a proveedores están pendientes de activación en la base de
          datos. Las recepciones habituales siguen disponibles.
        </p>
      )}
      {editing ? (
        <OperationPanel
          title="Preparar pedido"
          size="wide"
          description="Elegí el proveedor, revisá las cantidades y confirmá la llegada estimada."
          locked={operation.locked}
          onClose={() => setEditing(false)}
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                className="min-h-12"
                disabled={operation.locked}
                onClick={() => setEditing(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                form={formId}
                className="min-h-12 flex-1"
                disabled={locked}
              >
                Guardar borrador
              </Button>
            </>
          }
        >
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <OperationNotice
            error={operation.error}
            eventKey={operation.errorAttempt}
            uncertain={operation.uncertain}
            busy={operation.busy}
            retry={operation.retry}
          />
          <PurchaseOrderEditor
            formId={formId}
            initialLines={initialDraft}
            timeZone={timeZone}
            locked={locked}
            onCancel={() => setEditing(false)}
            onSave={(input) => operation.submit(endpoint, input)}
          />
        </OperationPanel>
      ) : order ? (
        <OperationPanel
          title="Detalle del pedido"
          size="wide"
          description="Seguí lo pedido y registrá cada entrega."
          locked={commandLocked}
          onClose={() => setSelected("")}
        >
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          )}
          <OperationNotice
            error={operation.error}
            eventKey={operation.errorAttempt}
            uncertain={operation.uncertain}
            busy={operation.busy}
            retry={operation.retry}
          />
          {notice && (
            <p role="status" className="rounded-lg bg-blue-50 p-3 text-sm">
              {notice}
            </p>
          )}
          <PurchaseOrderDetail
            key={`${order.id}:${order.revision}`}
            order={order}
            timeZone={timeZone}
            locked={locked}
            actorId={actorId}
            onUpdated={() => void load()}
            onAdvanceBusy={setAdvanceBusy}
            onBack={() => setSelected("")}
            onReceive={() => setReceiving(order)}
            onCommand={(command) =>
              operation.submit(`${endpoint}/${order.id}`, command)
            }
          />
        </OperationPanel>
      ) : (
        data?.available && (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-xl text-sm text-muted-foreground">
                Un pedido confirmado cuenta para las alertas según su llegada.
                El stock físico se actualiza al recibir.
              </p>
              <label className="flex items-center gap-3 text-sm">
                Mostrar
                <select
                  className="min-h-12 rounded-lg border border-line bg-white px-3"
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                >
                  <option value="open">Pendientes y borradores</option>
                  <option value="all">Todos los estados</option>
                </select>
              </label>
            </div>
            <label className="grid w-full max-w-md gap-2 text-sm font-semibold">
              Buscar pedido
              <span className="relative">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
                  aria-hidden="true"
                />
                <Input
                  type="search"
                  className="min-h-12 bg-white pl-10"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Proveedor o insumo…"
                />
              </span>
            </label>
            <section
              aria-label="Pedidos registrados"
              className="divide-y divide-line rounded-xl border border-line bg-white"
            >
              {!rows.length ? (
                <div className="p-10 text-center">
                  <Truck className="mx-auto size-8 text-blue-600" />
                  <h2 className="mt-4 font-semibold">
                    No hay pedidos para mostrar
                  </h2>
                  <p className="mt-2 text-sm text-muted-foreground">
                    Registrá el pedido cuando lo acuerdes con el proveedor.
                  </p>
                </div>
              ) : (
                rows.map((o) => (
                  <article
                    key={o.id}
                    className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="break-words font-bold">
                          {o.supplierName}
                        </p>
                        <OrderStatus
                          state={o.state}
                          overdue={
                            !!o.expectedOn && o.expectedOn < today(timeZone)
                          }
                        />
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {o.lines.length} insumo
                        {o.lines.length === 1 ? "" : "s"}{" "}
                      </p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {o.lines
                          .slice(0, 3)
                          .map((l) => l.itemName)
                          .join(" · ")}
                        {o.lines.length > 3
                          ? ` y ${o.lines.length - 3} más`
                          : ""}
                      </p>
                      <p
                        className={`mt-2 text-sm ${o.expectedOn && o.expectedOn < today(timeZone) && !["received", "cancelled"].includes(o.state) ? "font-semibold text-red-700" : "text-muted-foreground"}`}
                      >
                        Llegada:{" "}
                        {o.expectedOn
                          ? date(o.expectedOn)
                          : "Sin fecha confirmada"}
                        {o.expectedOn &&
                        o.expectedOn < today(timeZone) &&
                        !["received", "cancelled"].includes(o.state)
                          ? " · Atrasado"
                          : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {["ordered", "partially_received"].includes(o.state) && (
                        <Button
                          variant="outline"
                          className="min-h-12"
                          disabled={locked}
                          onClick={() => {
                            setSelected(o.id);
                            setReceiving(o);
                          }}
                        >
                          Registrar llegada
                        </Button>
                      )}
                      <Button
                        variant="outline"
                        className="min-h-12"
                        disabled={operation.locked}
                        onClick={() => {
                          setSelected(o.id);
                          setNotice("");
                        }}
                      >
                        Ver pedido <ArrowUpRight className="size-4" />
                      </Button>
                    </div>
                  </article>
                ))
              )}
            </section>
            <p className="text-xs text-muted-foreground">
              Se muestran hasta 100 pedidos recientes. Los enlaces del tablero
              también abren pedidos anteriores.
            </p>
          </>
        )
      )}
    </div>
  );
}
