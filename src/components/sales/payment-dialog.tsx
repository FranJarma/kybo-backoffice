"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Plus,
  Trash2,
  Banknote,
  CreditCard,
  Landmark,
  WalletCards,
  Check,
  ChevronRight,
  RefreshCw,
  LoaderCircle,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldCaption } from "@/components/ui/field-caption";
import { money } from "@/components/inventory/shared";
import { inputDecimal } from "@/components/recipes/shared";
import { cents, decimal, integer } from "@/modules/inventory/decimal";
import { Control, selectClass, OperationNotice } from "./shared";
import type { SaleLookup } from "@/modules/sales/types";
import { cashChange } from "./payment-math";

export type PaymentDraft = {
  collector: "local" | "platform";
  methodId?: string;
  amount: string;
  reference: string;
};
const methodIcons = { cash: Banknote, card: CreditCard, transfer: Landmark };

export function PaymentDialog({
  amount,
  delivery,
  exact,
  locked,
  busy,
  error,
  eventKey,
  uncertain,
  onRetry,
  onClose,
  onConfirm,
  methods,
  methodsError,
  methodsLoading,
  canManageMethods = false,
  onRefreshMethods,
}: {
  amount: string;
  delivery: boolean;
  exact: boolean;
  locked: boolean;
  busy: boolean;
  error: string;
  eventKey?: number | string;
  uncertain: boolean;
  onRetry: () => void;
  onClose: () => void;
  onConfirm: (payments: PaymentDraft[]) => void;
  methods: SaleLookup["rows"];
  methodsError: string;
  methodsLoading: boolean;
  canManageMethods?: boolean;
  onRefreshMethods: () => void;
}) {
  const [received, setReceived] = useState<Record<string, string>>({});
  const [rows, setRows] = useState<(PaymentDraft & { key: string })[]>([
    {
      key: "first",
      collector: "local",
      methodId: "",
      amount: inputDecimal(amount),
      reference: "",
    },
  ]);
  const split = rows.length > 1;
  let paid = 0n,
    valid = true;
  try {
    for (const row of rows) {
      paid += integer(decimal(row.amount, 2, true, true)!);
      if (row.collector === "local") {
        const method = methods.find((m) => m.id === row.methodId);
        if (
          !method ||
          (method.kind === "cash" &&
            !cashChange(received[row.key] ?? "", row.amount).valid)
        )
          valid = false;
      }
    }
  } catch {
    valid = false;
  }
  const due = integer(amount),
    remaining = due - paid;
  valid = valid && paid > 0n && paid <= due && (!exact || remaining === 0n);
  const missingMethod = rows.some(
    (row) =>
      row.collector === "local" && !methods.some((m) => m.id === row.methodId),
  );
  const change = (index: number, values: Partial<PaymentDraft>) =>
    setRows((current) =>
      current.map((r, i) => (i === index ? { ...r, ...values } : r)),
    );
  function remove(key: string) {
    setRows((current) => {
      const next = current.filter((row) => row.key !== key);
      // Returning to a single complete payment restores the sale total.
      return exact && next.length === 1
        ? [{ ...next[0], amount: inputDecimal(amount) }]
        : next;
    });
  }
  const summary =
    remaining < 0n
      ? `El importe supera el saldo por ${money(cents(-remaining))}.`
      : missingMethod
        ? "Elegí un medio de pago para continuar."
        : remaining > 0n
          ? `Quedan ${money(cents(remaining))} ${exact ? "por completar" : "pendientes; la cuenta seguirá abierta"}.`
          : !valid
            ? "Revisá los importes del cobro."
            : split
              ? "Los pagos cubren el total."
              : "Todo listo para confirmar.";
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !locked) onClose();
      }}
    >
      <DialogContent
        data-pos-payment
        className="flex max-h-[94dvh] flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-3xl [&_input]:min-h-12 [&_select]:min-h-12 [&_[data-slot=dialog-close]]:flex [&_[data-slot=dialog-close]]:min-h-12 [&_[data-slot=dialog-close]]:min-w-12 [&_[data-slot=dialog-close]]:items-center [&_[data-slot=dialog-close]]:justify-center"
        showCloseButton={!locked}
        onInteractOutside={(e) => {
          if (locked) e.preventDefault();
        }}
      >
        <DialogHeader className="shrink-0 border-b border-line px-5 py-5 text-left sm:grid sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:gap-6 sm:py-6 sm:pl-7 sm:pr-20">
          <div className="pr-12">
            <DialogTitle className="text-2xl font-bold tracking-tight text-brand">
              Registrar cobro
            </DialogTitle>
            <DialogDescription className="mt-2 text-muted">
              Elegí cómo paga el cliente.
            </DialogDescription>
          </div>
          <div className="mt-3 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 sm:mt-0 sm:block sm:text-right">
            <span className="pb-1 text-sm text-muted sm:block">
              {exact ? "Total de la venta" : "Saldo pendiente"}
            </span>
            <strong className="text-3xl font-extrabold tracking-tight text-brand tabular-nums sm:text-4xl">
              {money(amount)}
            </strong>
          </div>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7 sm:py-6">
          <fieldset disabled={locked} className="space-y-4">
            {rows.map((row, i) => {
              const method = methods.find((m) => m.id === row.methodId);
              const cash = row.collector === "local" && method?.kind === "cash";
              const changeDue = cashChange(received[row.key] ?? "", row.amount);
              return (
                <div
                  key={row.key}
                  className={
                    split
                      ? "space-y-5 rounded-xl border border-line p-4 sm:p-5"
                      : "space-y-5"
                  }
                >
                  {split && (
                    <div className="flex items-center justify-between">
                      <h3 className="text-base font-bold text-brand">
                        Pago {i + 1}
                      </h3>
                      <Button
                        type="button"
                        className="min-h-12 min-w-12 text-muted"
                        size="icon"
                        variant="ghost"
                        aria-label={`Quitar cobro ${i + 1}`}
                        onClick={() => remove(row.key)}
                      >
                        <Trash2 size={18} />
                      </Button>
                    </div>
                  )}
                  {delivery && (
                    <Control label={`Cobrado por ${i + 1}`} required>
                      <select
                        required
                        className={selectClass}
                        value={row.collector}
                        onChange={(e) =>
                          change(i, {
                            collector: e.target
                              .value as PaymentDraft["collector"],
                            methodId: "",
                          })
                        }
                      >
                        <option value="local">Kybo · cobro directo</option>
                        <option value="platform">La plataforma</option>
                      </select>
                    </Control>
                  )}
                  {row.collector === "local" ? (
                    <fieldset
                      aria-label={`Medio de pago ${i + 1}`}
                      className="min-w-0 space-y-3"
                    >
                      <legend className="mb-3 text-sm font-semibold text-brand">
                        <FieldCaption required>
                          {split ? "Medio de pago" : "¿Cómo paga?"}
                        </FieldCaption>
                      </legend>
                      {methodsLoading && (
                        <div
                          role="status"
                          className="flex items-center gap-2 py-3 text-sm text-muted"
                        >
                          <LoaderCircle size={18} className="animate-spin" />
                          Cargando medios de pago…
                        </div>
                      )}
                      {!methodsLoading && methodsError && (
                        <div
                          role="status"
                          className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
                        >
                          <p className="font-semibold">
                            No pudimos cargar los medios de pago.
                          </p>
                          <p className="mt-1 text-xs">{methodsError}</p>
                        </div>
                      )}
                      {!methodsLoading &&
                        !methodsError &&
                        methods.length === 0 && (
                          <div
                            role="status"
                            className="rounded-xl border border-dashed border-line bg-surface p-5"
                          >
                            <p className="text-sm font-semibold text-brand">
                              No hay medios de pago configurados.
                            </p>
                            <p className="mt-2 text-sm leading-6 text-muted">
                              {canManageMethods
                                ? "Agregá los medios que aceptás para comenzar a cobrar."
                                : "Pedile al administrador que configure los medios de pago del local."}
                            </p>
                            {canManageMethods && (
                              <Link
                                className="mt-3 inline-flex min-h-12 items-center gap-1 text-sm font-semibold text-blue underline-offset-4 hover:underline"
                                href="/settings/payment-methods"
                              >
                                Configurar medios de pago
                                <ChevronRight size={16} />
                              </Link>
                            )}
                          </div>
                        )}
                      <div
                        className={`grid grid-cols-2 gap-3 ${methods.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}
                      >
                        {methods.map((m) => {
                          const Icon =
                            methodIcons[m.kind as keyof typeof methodIcons] ??
                            WalletCards;
                          const selected = row.methodId === m.id;
                          return (
                            <button
                              type="button"
                              key={m.id}
                              aria-pressed={selected}
                              onClick={() => change(i, { methodId: m.id })}
                              className={`relative flex min-h-24 flex-col items-start justify-center gap-3 rounded-xl border px-4 py-4 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue ${selected ? "border-blue bg-blue-50 text-brand ring-1 ring-blue" : "border-line bg-white text-brand hover:border-blue/50 hover:bg-surface"}`}
                            >
                              <Icon
                                size={23}
                                aria-hidden="true"
                                className={
                                  selected ? "text-blue" : "text-muted"
                                }
                              />
                              <span className="break-words text-sm font-semibold leading-5">
                                {m.name}
                              </span>
                              {selected && (
                                <Check
                                  size={17}
                                  aria-hidden="true"
                                  className="absolute top-3 right-3 text-blue"
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>
                      {(methodsError || methods.length === 0) && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="min-h-12 px-0 text-blue"
                          disabled={methodsLoading}
                          onClick={onRefreshMethods}
                        >
                          <RefreshCw size={16} />
                          Actualizar
                        </Button>
                      )}
                    </fieldset>
                  ) : (
                    <div className="rounded-xl bg-blue-50 p-4 text-sm leading-6 text-brand">
                      La plataforma cobró al cliente. La liquidación a Kybo se
                      concilia por separado.
                    </div>
                  )}

                  {(split || !exact) && (
                    <Control label={`Importe ${i + 1}`} required>
                      <Input
                        required
                        className="text-lg font-semibold tabular-nums"
                        value={row.amount}
                        inputMode="decimal"
                        onChange={(e) => change(i, { amount: e.target.value })}
                      />
                    </Control>
                  )}
                  {cash && (
                    <div className="grid gap-4 rounded-xl bg-surface p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:p-5">
                      <div className="space-y-3">
                        <Control label={`Efectivo recibido ${i + 1}`} required>
                          <Input
                            required
                            className="bg-white text-lg font-semibold tabular-nums"
                            inputMode="decimal"
                            placeholder="Ingresá cuánto entrega"
                            value={received[row.key] ?? ""}
                            onChange={(e) =>
                              setReceived((r) => ({
                                ...r,
                                [row.key]: e.target.value,
                              }))
                            }
                          />
                        </Control>
                        <div className="flex flex-wrap gap-2">
                          {[
                            { label: "Importe exacto", value: row.amount },
                            { label: "$ 10.000", value: "10000" },
                            { label: "$ 20.000", value: "20000" },
                          ].map((option) => (
                            <Button
                              type="button"
                              className="min-h-12 bg-white text-xs"
                              variant="outline"
                              key={option.label}
                              onClick={() =>
                                setReceived((r) => ({
                                  ...r,
                                  [row.key]: option.value,
                                }))
                              }
                            >
                              {option.label}
                            </Button>
                          ))}
                        </div>
                      </div>
                      <p
                        aria-live="polite"
                        className={`self-center text-lg font-bold tabular-nums ${changeDue.valid ? "text-brand" : "text-red-700"}`}
                      >
                        {changeDue.valid
                          ? `Vuelto: ${money(changeDue.change ?? "0.00")}`
                          : "El efectivo recibido no cubre el cobro."}
                      </p>
                    </div>
                  )}
                  <details className="group">
                    <summary className="flex min-h-12 cursor-pointer list-none items-center gap-1 text-sm text-muted hover:text-brand">
                      <ChevronRight
                        size={16}
                        className="transition-transform group-open:rotate-90"
                      />
                      Agregar referencia (opcional)
                    </summary>
                    <Control label={`Referencia ${i + 1}`}>
                      <Input
                        value={row.reference}
                        maxLength={120}
                        placeholder="Número de operación o comprobante"
                        onChange={(e) =>
                          change(i, { reference: e.target.value })
                        }
                      />
                    </Control>
                  </details>
                </div>
              );
            })}
            {rows.length < 10 && (
              <Button
                type="button"
                variant="ghost"
                className="min-h-12 px-0 text-blue"
                onClick={() =>
                  setRows([
                    ...rows,
                    {
                      key: crypto.randomUUID(),
                      collector: "local",
                      methodId: "",
                      amount:
                        remaining > 0n ? inputDecimal(cents(remaining)) : "",
                      reference: "",
                    },
                  ])
                }
              >
                <Plus size={17} />
                Dividir cobro
              </Button>
            )}
          </fieldset>
        </div>

        <div
          data-payment-footer
          className="shrink-0 space-y-3 border-t border-line bg-white px-5 py-4 sm:px-7"
        >
          <OperationNotice
            eventKey={eventKey}
            error={error}
            uncertain={uncertain}
            busy={busy}
            retry={onRetry}
          />
          <p
            aria-live="polite"
            className={`text-sm ${remaining < 0n ? "text-red-700" : "text-muted"}`}
          >
            {error ? "Revisá el aviso antes de volver a confirmar." : summary}
          </p>
          <div className="flex gap-3">
            <Button
              type="button"
              variant="ghost"
              className="min-h-14 px-4 text-muted"
              disabled={locked}
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              className="min-h-14 min-w-0 flex-1 text-base"
              disabled={locked || !valid}
              onClick={() =>
                onConfirm(
                  rows.map(({ collector, methodId, amount, reference }) => ({
                    collector,
                    methodId: collector === "local" ? methodId : undefined,
                    amount,
                    reference,
                  })),
                )
              }
            >
              {busy ? (
                <>
                  <LoaderCircle size={18} className="animate-spin" />
                  Guardando…
                </>
              ) : (
                <>
                  Confirmar cobro
                  <ChevronRight size={18} />
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
