"use client";
import { CheckCircle2, Plus, WalletCards, Ban, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { money } from "@/components/inventory/shared";
import {
  channelLabels,
  originLabels,
  statusLabels,
  type SaleDetail,
} from "@/modules/sales/types";
const time = (value: string) =>
  new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Salta",
  }).format(new Date(value));
export function SaleDetailPanel({
  sale,
  canCancel,
  locked,
  onPay,
  onAdd,
  onCancel,
  onBack,
}: {
  sale: SaleDetail;
  canCancel: boolean;
  locked: boolean;
  onPay: () => void;
  onAdd: () => void;
  onCancel: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <button
            onClick={onBack}
            disabled={locked}
            className="mb-3 flex min-h-9 items-center gap-1 text-xs font-semibold text-muted hover:text-brand"
          >
            <ArrowLeft size={14} />
            Volver a ventas
          </button>
          <h2 className="text-2xl font-extrabold tracking-tight text-brand">
            Venta #{sale.number}
          </h2>
          <p className="mt-2 text-sm text-muted">
            {originLabels[sale.origin]}
            {sale.tableName ? ` · ${sale.tableName}` : ""} ·{" "}
            {channelLabels[sale.channel]} · {time(sale.createdAt)}
          </p>
        </div>
        <span
          className={`status-pill ${sale.status === "closed" ? "bg-emerald-50 text-emerald-800" : sale.status === "cancelled" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}
        >
          {sale.status === "closed" && <CheckCircle2 size={14} />}{" "}
          {statusLabels[sale.status]}
        </span>
      </div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-4">
          <div className="surface-panel p-5">
            <p className="eyebrow mb-2">Cliente</p>
            <p className="font-bold text-brand">
              {sale.customerName ?? "Consumidor ocasional"}
            </p>
            {sale.externalId && (
              <p className="mt-2 break-all text-sm text-muted">
                Pedido externo: {sale.externalId}
              </p>
            )}
            {sale.notes && (
              <p className="mt-2 whitespace-pre-wrap text-sm text-muted">
                {sale.notes}
              </p>
            )}
          </div>
          {sale.orders.map((order) => (
            <article key={order.id} className="surface-panel overflow-hidden">
              <div className="flex justify-between gap-3 border-b border-line px-5 py-4">
                <h3 className="text-sm font-bold">Pedido {order.sequence}</h3>
                <span className="text-xs text-muted">
                  {time(order.createdAt)}
                </span>
              </div>
              <div className="divide-y divide-line px-5">
                {order.lines.map((line) => (
                  <div key={line.id} className="py-4">
                    <div className="flex justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-brand">
                          {line.quantity} × {line.name}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          {money(line.unitPrice)} por unidad
                        </p>
                      </div>
                      <strong className="shrink-0 text-sm tabular-nums">
                        {money(line.lineTotal)}
                      </strong>
                    </div>
                    {line.priceReason && (
                      <p className="mt-2 text-xs text-amber-800">
                        Precio aplicado: {line.priceReason}
                        {line.listPrice !== null
                          ? ` · Lista: ${money(line.listPrice)}`
                          : " · Sin precio de lista"}
                      </p>
                    )}
                    {line.notes && (
                      <p className="mt-2 whitespace-pre-wrap text-xs text-muted">
                        {line.notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              {order.notes && order.sequence > 1 && (
                <p className="border-t border-line px-5 py-3 text-sm text-muted">
                  {order.notes}
                </p>
              )}
            </article>
          ))}
        </section>
        <aside className="space-y-4">
          <section className="surface-panel p-5">
            <p className="eyebrow mb-3">Resumen de la cuenta</p>
            <dl className="space-y-4 text-sm">
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Total registrado</dt>
                <dd className="font-bold tabular-nums">
                  {money(sale.totalAmount)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-muted">Cobrado por Kybo</dt>
                <dd className="font-semibold tabular-nums">
                  {money(sale.localCollected)}
                </dd>
              </div>
              {sale.channel !== "counter" && (
                <div className="flex justify-between gap-2">
                  <dt className="text-muted">Cobrado por plataforma</dt>
                  <dd
                    data-testid="platform-collected"
                    className="font-semibold tabular-nums"
                  >
                    {money(sale.platformCollected)}
                  </dd>
                </div>
              )}
              <div className="flex items-center justify-between gap-2 border-t border-line pt-4">
                <dt className="font-semibold">Saldo pendiente</dt>
                <dd
                  data-testid="sale-balance"
                  className="text-xl font-extrabold tabular-nums text-brand"
                >
                  {money(sale.balanceDue)}
                </dd>
              </div>
            </dl>
            {sale.status === "open" && (
              <div className="mt-5 space-y-2">
                <Button className="w-full" disabled={locked} onClick={onPay}>
                  <WalletCards size={17} />
                  Registrar cobro
                </Button>
                {sale.origin === "table" && (
                  <Button
                    className="w-full"
                    variant="outline"
                    disabled={locked}
                    onClick={onAdd}
                  >
                    <Plus size={17} />
                    Agregar pedido
                  </Button>
                )}
              </div>
            )}
            {sale.channel !== "counter" && (
              <p className="mt-4 text-xs leading-relaxed text-muted">
                El cobro de la plataforma no confirma una liquidación ni permite
                calcular la ganancia.
              </p>
            )}
            {canCancel && sale.status !== "cancelled" && (
              <Button
                className="mt-4 w-full text-red-700"
                variant="ghost"
                disabled={locked}
                onClick={onCancel}
              >
                <Ban size={15} />
                Anular venta
              </Button>
            )}
            {sale.cancelReason && (
              <p className="mt-4 text-sm text-red-800">
                Anulada: {sale.cancelReason}
              </p>
            )}
          </section>
          <section className="surface-panel p-5">
            <h3 className="mb-4 text-sm font-bold">Movimientos de cobro</h3>
            {sale.payments.length === 0 ? (
              <p className="text-sm text-muted">
                Todavía no hay cobros registrados.
              </p>
            ) : (
              <div className="space-y-4">
                {sale.payments.map((p) => (
                  <div
                    key={p.id}
                    className="border-b border-line pb-3 last:border-0 last:pb-0"
                  >
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="min-w-0 font-semibold">
                        {p.kind === "refund" ? "Devolución · " : ""}
                        {p.collector === "platform"
                          ? channelLabels[sale.channel]
                          : p.methodName}
                      </span>
                      <span className="shrink-0 tabular-nums">
                        {p.kind === "refund" ? "−" : ""}
                        {money(p.amount)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-muted">
                      {time(p.createdAt)}
                    </p>
                    {p.reference && (
                      <p className="mt-2 break-all text-xs font-medium">
                        {p.reference}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
