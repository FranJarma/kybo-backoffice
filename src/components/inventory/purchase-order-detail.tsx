"use client";
import { useState } from "react";
import { CalendarClock, PackageCheck, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { integer } from "@/modules/inventory/decimal";
import type { PurchaseOrder, OrderCommand } from "@/modules/procurement/types";
import { date, money, quantity, today } from "./shared";
import { PurchaseAdvanceForm } from "./purchase-advance-form";
export const orderStates = {
  draft: "Borrador",
  ordered: "Pedido en camino",
  partially_received: "Recibido parcialmente",
  received: "Recibido",
  cancelled: "Cancelado",
};
export function PurchaseOrderDetail({
  order: o,
  timeZone,
  locked,
  onBack,
  onReceive,
  onCommand,
  actorId,
  onUpdated,
}: {
  order: PurchaseOrder;
  timeZone: string;
  locked: boolean;
  onBack: () => void;
  onReceive: () => void;
  onCommand: (command: OrderCommand) => void;
  actorId?: string;
  onUpdated?: () => void;
}) {
  const [mode, setMode] = useState<"reschedule" | "cancel" | null>(null),
    [expectedOn, setExpectedOn] = useState(o.expectedOn ?? ""),
    [reason, setReason] = useState("");
  const closed = ["received", "cancelled"].includes(o.state),
    overdue = !!o.expectedOn && o.expectedOn < today(timeZone) && !closed;
  const submit = (action: "confirm" | "reschedule" | "cancel") =>
    onCommand({
      requestId: crypto.randomUUID(),
      expectedRevision: o.revision,
      ...(action === "confirm"
        ? { action }
        : action === "cancel"
          ? { action, reason }
          : { action, expectedOn: expectedOn || null, reason }),
    });
  return (
    <section className="space-y-5">
      <Button variant="ghost" disabled={locked} onClick={onBack}>
        <span aria-hidden="true">←</span> Volver a pedidos
      </Button>
      <div className="rounded-xl border border-line bg-white">
        <header className="space-y-4 border-b border-line p-5 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-widest text-muted-foreground">
                Pedido · {o.id.slice(0, 8).toUpperCase()}
              </p>
              <h2 className="mt-2 text-2xl font-bold">{o.supplierName}</h2>
            </div>
            <span
              className={`rounded-lg px-3 py-2 text-sm font-semibold ${closed ? "bg-slate-100 text-slate-600" : overdue ? "bg-red-50 text-red-800" : "bg-blue-50 text-blue-800"}`}
            >
              {orderStates[o.state]}
            </span>
          </div>
          <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
            <p>
              Pedido: <strong>{date(o.orderedOn)}</strong>
            </p>
            <p className={overdue ? "text-red-700" : ""}>
              <CalendarClock className="mr-2 inline size-4" />
              Llegada:{" "}
              <strong>
                {o.expectedOn ? date(o.expectedOn) : "Sin fecha confirmada"}
              </strong>
              {overdue && " · Atrasado"}
            </p>
          </div>
          {o.notes && (
            <p className="break-words text-sm text-muted-foreground">
              {o.notes}
            </p>
          )}
          {!closed && (
            <p className="text-sm text-muted-foreground">
              {o.state === "draft"
                ? "Este borrador no cuenta como mercadería pedida. Confirmalo una vez acordado con el proveedor."
                : !o.expectedOn || overdue
                  ? "Consultá al proveedor y actualizá la fecha: este pedido no aporta cobertura a las alertas mientras la llegada no esté vigente."
                  : "El tablero considera lo pendiente según esta fecha. El stock físico aumenta al registrar cada recepción."}
            </p>
          )}
        </header>
        <div className="divide-y divide-line">
          {o.lines.map((l) => (
            <article
              key={l.id}
              className="grid gap-4 p-5 sm:grid-cols-[1fr_1fr] sm:p-7"
            >
              <div>
                <h3 className="font-semibold">{l.itemName}</h3>
                {l.presentationName && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {l.presentationName} ·{" "}
                    {quantity(l.conversionFactor, l.baseUnit)} por presentación
                  </p>
                )}
                {integer(l.cancelledQuantity) > 0n && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    Cancelado: {quantity(l.cancelledQuantity, l.baseUnit)}
                  </p>
                )}
              </div>
              <dl className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <dt className="text-muted-foreground">Pedido</dt>
                  <dd className="mt-2 font-semibold tabular-nums">
                    {quantity(l.orderedQuantity, l.baseUnit)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Recibido</dt>
                  <dd className="mt-2 font-semibold tabular-nums">
                    {quantity(l.receivedQuantity, l.baseUnit)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Pendiente</dt>
                  <dd className="mt-2 font-bold text-blue-700 tabular-nums">
                    {quantity(l.pendingQuantity, l.baseUnit)}
                  </dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
        {!closed && (
          <footer className="flex flex-wrap gap-3 border-t border-line p-5 sm:p-7">
            {o.state === "draft" ? (
              <Button
                className="min-h-12"
                disabled={locked}
                onClick={() => submit("confirm")}
              >
                <Truck className="size-4" />
                Confirmar pedido realizado
              </Button>
            ) : (
              <Button
                className="min-h-12"
                disabled={locked}
                onClick={onReceive}
              >
                <PackageCheck className="size-4" />
                Registrar llegada
              </Button>
            )}
            <Button
              variant="outline"
              className="min-h-12"
              disabled={locked}
              onClick={() => {
                setMode("reschedule");
                setReason("");
              }}
            >
              Actualizar fecha
            </Button>
            <Button
              variant="ghost"
              className="min-h-12 text-red-700"
              disabled={locked}
              onClick={() => {
                setMode("cancel");
                setReason("");
              }}
            >
              Cancelar {o.state === "draft" ? "borrador" : "lo pendiente"}
            </Button>
          </footer>
        )}
      </div>
      {o.financial && (
        <section className="space-y-4 rounded-xl border border-line bg-white p-5 sm:p-7">
          <h3 className="font-bold">Anticipos del pedido</h3>
          <dl className="grid gap-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-muted">Adelantado</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">
                {money(o.financial.advancedAmount)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Aplicado a recepciones</dt>
              <dd className="mt-1 text-lg font-semibold tabular-nums">
                {money(o.financial.appliedAmount)}
              </dd>
            </div>
            <div>
              <dt className="text-muted">Crédito disponible</dt>
              <dd className="mt-1 text-lg font-bold text-blue-700 tabular-nums">
                {money(o.financial.availableAmount)}
              </dd>
            </div>
          </dl>
          <p className="text-sm text-muted">
            El costo final se conoce al recibir. El anticipo no define un total
            del pedido.
          </p>
          {o.state === "cancelled" &&
            integer(o.financial.availableAmount) > 0n && (
              <p
                role="status"
                className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900"
              >
                Crédito pendiente de resolver por administración. Cancelar este
                pedido no devuelve el dinero.
              </p>
            )}
          {!!o.financial.advances.length && (
            <ul className="divide-y divide-line text-sm">
              {o.financial.advances.map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap justify-between gap-2 py-3"
                >
                  <div>
                    <p className="font-semibold">
                      {a.source === "external"
                        ? "Pagado fuera de caja"
                        : "Efectivo del cajón"}{" "}
                      · {a.paymentMethodName}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {date(a.paidOn)} · {a.reference || "Sin referencia"}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold">{money(a.amount)}</p>
                    <p className="mt-1 text-xs text-muted">
                      Disponible: {money(a.availableAmount)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      {actorId && onUpdated && o.financial?.available && (
        <PurchaseAdvanceForm
          actorId={actorId}
          order={o}
          timeZone={timeZone}
          locked={locked}
          onSaved={onUpdated}
        />
      )}
      {mode && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(mode);
          }}
          className="space-y-4 rounded-xl border border-line bg-white p-5"
        >
          <h3 className="font-bold">
            {mode === "cancel"
              ? "Cancelar el remanente del pedido"
              : "Actualizar llegada estimada"}
          </h3>
          <p className="text-sm text-muted-foreground">
            {mode === "cancel"
              ? "Lo que ya recibiste conserva su stock y sus comprobantes. Solo se cancela la mercadería pendiente."
              : "Ingresá la fecha acordada con el proveedor. Si todavía no la sabés, dejala vacía."}
          </p>
          <fieldset disabled={locked} className="grid gap-4 sm:grid-cols-2">
            {mode === "reschedule" && (
              <label className="space-y-2 text-sm font-semibold">
                Nueva llegada estimada
                <Input
                  type="date"
                  min={o.orderedOn}
                  value={expectedOn}
                  onChange={(e) => setExpectedOn(e.target.value)}
                />
              </label>
            )}
            <label className="space-y-2 text-sm font-semibold">
              Motivo del cambio
              <Input
                required
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
          </fieldset>
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={locked}
              onClick={() => setMode(null)}
            >
              Volver
            </Button>
            <Button disabled={locked}>
              {mode === "cancel" ? "Confirmar cancelación" : "Guardar fecha"}
            </Button>
          </div>
        </form>
      )}
      {!!o.receipts.length && (
        <section className="rounded-xl border border-line bg-white p-5">
          <h3 className="font-semibold">Recepciones registradas</h3>
          <ul className="mt-3 divide-y divide-line text-sm">
            {o.receipts.map((r) => (
              <li key={r.id} className="py-3">
                {date(r.receivedOn)} ·{" "}
                {r.documentNumber || "Sin comprobante externo"}
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted-foreground">
            Consultá costos, fletes y pagos en la pestaña Recepciones.
          </p>
        </section>
      )}
    </section>
  );
}
