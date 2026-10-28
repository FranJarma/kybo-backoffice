"use client";
import { useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OperationNotice } from "@/components/sales/shared";
import type {
  PurchaseAdvanceInput,
  PurchaseOrder,
} from "@/modules/procurement/types";
import { SearchSelect, today, useOperation } from "./shared";

export function PurchaseAdvanceForm({
  actorId,
  order,
  timeZone,
  locked,
  onSaved,
}: {
  actorId: string;
  order: PurchaseOrder;
  timeZone: string;
  locked: boolean;
  onSaved: () => void;
}) {
  const [visible, setVisible] = useState(false),
    [source, setSource] = useState<"cash" | "external">("external"),
    [paymentMethodId, setMethod] = useState(""),
    [paidOn, setDate] = useState(today(timeZone)),
    [amount, setAmount] = useState(""),
    [reference, setReference] = useState("");
  const saved = useCallback(() => {
    setVisible(false);
    setAmount("");
    setReference("");
    onSaved();
  }, [onSaved]);
  const operation = useOperation<PurchaseAdvanceInput>(
    actorId,
    "purchase-advance",
    saved,
  );
  const canRegister = ["ordered", "partially_received"].includes(order.state);
  if (!canRegister && !operation.uncertain) return null;
  return (
    <section className="space-y-4 rounded-xl border border-line bg-white p-5 sm:p-7">
      <OperationNotice
        error={operation.error}
        eventKey={operation.errorAttempt}
        uncertain={operation.uncertain}
        busy={operation.busy}
        retry={operation.retry}
      />
      {!visible && !operation.uncertain ? (
        <Button
          variant="outline"
          disabled={locked || operation.locked}
          onClick={() => setVisible(true)}
        >
          Registrar anticipo al proveedor
        </Button>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            operation.submit(`/api/procurement/orders/${order.id}/advances`, {
              requestId: crypto.randomUUID(),
              supplierId: order.supplierId,
              expectedRevision: order.revision,
              paymentMethodId,
              paidOn,
              amount,
              source,
              reference: reference || null,
            });
          }}
        >
          <div>
            <h3 className="font-bold">
              Registrar anticipo a {order.supplierName}
            </h3>
            <p className="mt-1 text-sm text-muted">
              Cargá el importe que ya pagaste. Se aplicará al recibir mercadería
              con costo conocido.
            </p>
          </div>
          <fieldset
            disabled={locked || operation.locked}
            className="grid gap-4 sm:grid-cols-2"
          >
            <label className="space-y-2 text-sm font-semibold">
              Origen del dinero
              <select
                className="form-control"
                value={source}
                onChange={(e) => {
                  setSource(e.target.value as "cash" | "external");
                  setMethod("");
                }}
              >
                <option value="external">Fuera de caja</option>
                <option value="cash">Efectivo del cajón</option>
              </select>
            </label>
            <SearchSelect
              entity="payment-methods"
              label="Medio del anticipo"
              value={paymentMethodId}
              onChange={setMethod}
              filter={source === "cash" ? (r) => r.kind === "cash" : undefined}
              required
            />
            <label className="space-y-2 text-sm font-semibold">
              Fecha de pago
              <Input
                required
                type="date"
                min={order.orderedOn}
                max={today(timeZone)}
                value={paidOn}
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label className="space-y-2 text-sm font-semibold">
              Importe pagado (ARS)
              <Input
                required
                inputMode="decimal"
                value={amount}
                placeholder="0,00"
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="space-y-2 text-sm font-semibold sm:col-span-2">
              Referencia
              <Input
                value={reference}
                maxLength={160}
                onChange={(e) => setReference(e.target.value)}
              />
            </label>
          </fieldset>
          <p className="text-sm text-muted">
            {source === "cash"
              ? "El anticipo se descontará una sola vez de la caja abierta."
              : "Pagado fuera de caja. Este registro no disminuye el efectivo del cajón."}
          </p>
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={operation.locked}
              onClick={() => setVisible(false)}
            >
              Cancelar
            </Button>
            <Button disabled={locked || operation.locked}>
              Confirmar anticipo
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
