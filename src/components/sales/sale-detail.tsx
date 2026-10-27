"use client";
import { Ban, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { money } from "@/components/inventory/shared";
import { SaleFulfillmentPanel } from "./fulfillment-panel";
import { LocatorManager } from "@/components/pickup/locator-manager";
import { channelLabels, type SaleDetail } from "@/modules/sales/types";
const time = (value: string) =>
  new Intl.DateTimeFormat("es-AR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Argentina/Salta",
  }).format(new Date(value));

export function SaleDetailPanel({
  actorId,
  sale,
  canCancel,
  locked,
  onCancel,
  onLocatorChanged,
  onBusy,
  onOpenSale,
}: {
  actorId: string;
  sale: SaleDetail;
  canCancel: boolean;
  locked: boolean;
  onCancel: () => void;
  onLocatorChanged?: () => void;
  onBusy?: (busy: boolean) => void;
  onOpenSale: (saleId: string) => void;
}) {
  return (
    <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
      <section className="min-w-0 space-y-4" aria-label="Productos y entrega">
        {sale.notes && (
          <p className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-brand">
            <span className="font-semibold">Nota de la venta: </span>
            {sale.notes}
          </p>
        )}
        <SaleFulfillmentPanel
          key={`${sale.id}:${sale.revision}`}
          actorId={actorId}
          saleId={sale.id}
          canManage={canCancel}
          onChanged={onLocatorChanged}
          onBusy={onBusy}
          renderOrders={(renderProgress) =>
            sale.orders.map((order) => (
              <article
                key={order.id}
                className="overflow-hidden rounded-xl border border-line bg-white"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-slate-50/70 px-4 py-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-bold text-brand">
                      Pedido {sale.number}.{order.sequence}
                      {order.locatorNumber != null
                        ? ` · Localizador ${order.locatorNumber}`
                        : ""}
                    </h3>
                    <p className="mt-1 text-xs text-muted">
                      {time(order.createdAt)}
                    </p>
                  </div>
                  <LocatorManager
                    actorId={actorId}
                    orderId={order.id}
                    label={`${sale.number}.${order.sequence}`}
                    cancelled={sale.status === "cancelled"}
                    onChanged={onLocatorChanged}
                    onOpenSale={onOpenSale}
                    disabled={locked}
                  />
                </div>
                <div className="divide-y divide-line px-4">
                  {order.lines.map((line) => (
                    <div
                      key={line.id}
                      className={`py-4 ${line.lineKind === "combo_component" ? "pl-4" : ""}`}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-brand">
                            <span className="mr-2 text-muted">
                              {line.quantity} ×
                            </span>
                            <span>{line.name}</span>
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {line.lineKind === "combo_component"
                              ? "Incluido en el combo"
                              : `${money(line.unitPrice)} por unidad`}
                          </p>
                        </div>
                        <strong className="shrink-0 text-sm tabular-nums">
                          {line.lineKind === "combo_component"
                            ? "Incluido"
                            : money(line.lineTotal)}
                        </strong>
                      </div>
                      {line.modifiers?.map((m, i) => (
                        <p key={i} className="mt-1 text-xs text-muted">
                          {m.count} × {m.optionName}
                        </p>
                      ))}
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
                      {line.lineKind !== "combo" && renderProgress(line.id)}
                    </div>
                  ))}
                </div>
                {order.notes && order.sequence > 1 && (
                  <p className="border-t border-line px-4 py-3 text-sm text-muted">
                    {order.notes}
                  </p>
                )}
              </article>
            ))
          }
        />
      </section>
      <aside className="min-w-0 space-y-4">
        <section className="rounded-xl border border-line p-4">
          <h3 className="text-sm font-bold text-brand">Resumen de la venta</h3>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Total registrado</dt>
              <dd className="font-semibold tabular-nums">
                {money(sale.totalAmount)}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted">Cobrado por Kybo</dt>
              <dd className="tabular-nums">{money(sale.localCollected)}</dd>
            </div>
            {sale.channel !== "counter" && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted">Cobrado por plataforma</dt>
                <dd data-testid="platform-collected" className="tabular-nums">
                  {money(sale.platformCollected)}
                </dd>
              </div>
            )}
            <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
              <dt className="font-semibold">Saldo pendiente</dt>
              <dd
                data-testid="sale-balance"
                className="text-lg font-extrabold tabular-nums text-brand"
              >
                {money(sale.balanceDue)}
              </dd>
            </div>
          </dl>
          {sale.payments.length === 1 && (
            <p className="mt-3 text-xs text-muted">
              Forma de pago:{" "}
              {sale.payments[0].collector === "platform"
                ? channelLabels[sale.channel]
                : sale.payments[0].methodName}
            </p>
          )}
          {sale.channel !== "counter" && (
            <p className="mt-3 text-xs text-muted">
              El cobro de la plataforma no confirma su liquidación.
            </p>
          )}
        </section>
        <details className="rounded-xl border border-line p-4">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-brand">
            Cobros e historial · {sale.payments.length}
            <ChevronDown
              size={16}
              className="ml-auto shrink-0"
              aria-hidden="true"
            />
          </summary>
          {!sale.payments.length ? (
            <p className="py-3 text-sm text-muted">
              Todavía no hay cobros registrados.
            </p>
          ) : (
            <div className="mt-3 space-y-4">
              {sale.payments.map((p) => (
                <div key={p.id} className="border-t border-line pt-3 text-xs">
                  <div className="flex justify-between gap-3 font-semibold">
                    <span>
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
                  <p className="mt-1 text-muted">{time(p.createdAt)}</p>
                  {p.reference && (
                    <p className="mt-2 break-all">{p.reference}</p>
                  )}
                  {canCancel && p.kind === "refund" && (
                    <p className="mt-2 text-muted">
                      La devolución no confirma el reintegro de la comisión del
                      proveedor.
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </details>
        {canCancel && (
          <details className="rounded-xl border border-line p-4">
            <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold text-brand">
              Comisiones e impuestos
              <ChevronDown
                size={16}
                className="ml-auto shrink-0"
                aria-hidden="true"
              />
            </summary>
            <div className="mt-3 space-y-3 text-xs text-muted">
              {sale.payments
                .filter((p) => p.kind === "collection")
                .map((p) => (
                  <p key={p.id}>
                    {p.methodName ?? channelLabels[sale.channel]}:{" "}
                    {p.commissionAmount == null ? (
                      "Comisión sin determinar."
                    ) : (
                      <>
                        comisión{" "}
                        {Number(p.commissionPercent).toLocaleString("es-AR")}%:{" "}
                        {money(p.commissionAmount)} · Neto estimado:{" "}
                        {money(p.settlementNet!)}. Antes de retenciones y
                        ajustes de liquidación.
                      </>
                    )}
                  </p>
                ))}
              {sale.orders
                .flatMap((order) => order.lines)
                .filter(
                  (line) =>
                    line.lineKind !== "combo_component" && line.vatRate != null,
                )
                .map((line) => (
                  <p key={line.id}>
                    {line.name} · Neto: {money(line.netTotal!)} · IVA{" "}
                    {Number(line.vatRate).toLocaleString("es-AR")}%:{" "}
                    {money(line.vatTotal!)}
                  </p>
                ))}
            </div>
          </details>
        )}
        {sale.cancelReason && (
          <p className="rounded-xl bg-red-50 p-4 text-sm text-red-800">
            Anulada: {sale.cancelReason}
          </p>
        )}
        {canCancel && sale.status !== "cancelled" && (
          <Button
            type="button"
            variant="ghost"
            className="min-h-12 w-full text-red-700"
            disabled={locked}
            onClick={onCancel}
          >
            <Ban size={15} />
            Anular venta
          </Button>
        )}
      </aside>
    </div>
  );
}
