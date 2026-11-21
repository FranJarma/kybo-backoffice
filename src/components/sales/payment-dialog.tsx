"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Banknote,
  Check,
  ChevronRight,
  CreditCard,
  Landmark,
  LoaderCircle,
  Plus,
  RefreshCw,
  Trash2,
  WalletCards,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { inputDecimal } from "@/components/recipes/shared";
import { money } from "@/lib/number-format";
import { cents } from "@/modules/inventory/decimal";
import type { SaleLookup } from "@/modules/sales/types";
import {
  cashChange,
  cashPaymentSummary,
  paymentAllocation,
  type CashPaymentSummary,
} from "./payment-math";
import {
  CardPaymentField,
  CashPaymentFields,
  OptionalPaymentReference,
  TransferPaymentFields,
  paymentReferenceLimit,
  transferReference,
} from "./payment-fields";
import { Control, OperationNotice, selectClass } from "./shared";

export type PaymentDraft = {
  collector: "local" | "platform";
  methodId?: string;
  amount: string;
  reference: string;
};

export type { CashPaymentSummary } from "./payment-math";

type CheckoutRow = PaymentDraft & {
  key: string;
  received: string;
  holder: string;
  verifiedAmount: string | null;
};

const emptyMethodFields = {
  methodId: "",
  reference: "",
  received: "",
  holder: "",
  verifiedAmount: null,
};

function newRow(key: string, amount: string): CheckoutRow {
  return { key, collector: "local", amount, ...emptyMethodFields };
}

type PaymentMethods = SaleLookup["rows"];
const methodIcons = { cash: Banknote, card: CreditCard, transfer: Landmark };

function MethodChoice({
  methods,
  methodId,
  position,
  split,
  onChange,
}: {
  methods: PaymentMethods;
  methodId?: string;
  position: number;
  split: boolean;
  onChange: (methodId: string) => void;
}) {
  if (split) {
    return (
      <Control label={`Medio de pago ${position}`} required>
        <select
          className={selectClass}
          value={methodId ?? ""}
          required
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="">Elegí un medio de pago</option>
          {methods.map((method) => (
            <option key={method.id} value={method.id}>
              {method.name}
            </option>
          ))}
        </select>
      </Control>
    );
  }

  return (
    <fieldset className="pos-payment-methods">
      <legend>¿Cómo paga el cliente?</legend>
      <div className="pos-payment-method-tiles">
        {methods.map((method) => {
          const Icon =
            methodIcons[method.kind as keyof typeof methodIcons] ?? WalletCards;
          const selected = methodId === method.id;
          return (
            <button
              type="button"
              key={method.id}
              aria-pressed={selected}
              onClick={() => onChange(method.id)}
              className="pos-payment-method"
            >
              <Icon size={24} aria-hidden="true" />
              <span>{method.name}</span>
              {selected && (
                <Check
                  className="pos-payment-method-check"
                  size={16}
                  aria-hidden="true"
                />
              )}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function MethodStatus({
  loading,
  error,
  empty,
  canManage,
  onRefresh,
}: {
  loading: boolean;
  error: string;
  empty: boolean;
  canManage: boolean;
  onRefresh: () => void;
}) {
  if (loading)
    return (
      <p role="status" className="pos-payment-method-status">
        <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
        Cargando medios de pago…
      </p>
    );
  if (!error && !empty) return null;

  return (
    <div className="pos-payment-method-notice">
      <div role="status">
        <p className="font-semibold">
          {error
            ? "No pudimos cargar los medios de pago."
            : "No hay medios de pago configurados."}
        </p>
        <p className="mt-1 text-sm text-muted">
          {error ||
            (canManage
              ? "Agregá los medios que aceptás para comenzar a cobrar."
              : "Pedile al administrador que configure los medios de pago del local.")}
        </p>
      </div>
      {!error && canManage && (
        <Link
          className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-blue underline-offset-4 hover:underline"
          href="/settings/payment-methods"
        >
          Configurar medios de pago
          <ChevronRight size={16} aria-hidden="true" />
        </Link>
      )}
      <Button
        type="button"
        variant="ghost"
        onClick={onRefresh}
        className="min-h-11"
      >
        <RefreshCw size={16} aria-hidden="true" />
        Actualizar
      </Button>
    </div>
  );
}

function AppliedAmount({
  position,
  amount,
  valid,
  onChange,
}: {
  position: number;
  amount: string;
  valid: boolean;
  onChange: (amount: string) => void;
}) {
  const messageId = useId();
  return (
    <div>
      <Control label={`Importe ${position}`} required>
        <Input
          required
          inputMode="decimal"
          className="tabular-nums"
          value={amount}
          aria-invalid={!valid}
          aria-describedby={valid ? undefined : messageId}
          onChange={(event) => onChange(event.target.value)}
        />
      </Control>
      {!valid && (
        <p id={messageId} className="pos-payment-field-error">
          Ingresá un importe mayor a cero con hasta dos decimales.
        </p>
      )}
    </div>
  );
}

function PaymentTotals({
  amount,
  assigned,
  remaining,
}: {
  amount: string;
  assigned: bigint;
  remaining: bigint;
}) {
  return (
    <dl className="pos-payment-totals" aria-live="polite">
      <div>
        <dt>Total</dt>
        <dd>{money(amount)}</dd>
      </div>
      <div>
        <dt>Asignado</dt>
        <dd>{money(cents(assigned))}</dd>
      </div>
      <div data-excess={remaining < 0n || undefined}>
        <dt>{remaining < 0n ? "Excedente" : "Falta cubrir"}</dt>
        <dd>{money(cents(remaining < 0n ? -remaining : remaining))}</dd>
      </div>
    </dl>
  );
}

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
  canDiscard = false,
  onDiscard,
  onClose,
  onConfirm,
  methods,
  methodsError,
  methodsLoading,
  canManageMethods = false,
  onRefreshMethods,
  checkoutIssue = "",
  fontClassName = "",
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
  canDiscard?: boolean;
  onDiscard?: () => void;
  onClose: () => void;
  onConfirm: (payments: PaymentDraft[], cash?: CashPaymentSummary) => void;
  methods: PaymentMethods;
  methodsError: string;
  methodsLoading: boolean;
  canManageMethods?: boolean;
  onRefreshMethods: () => void;
  checkoutIssue?: string;
  fontClassName?: string;
}) {
  const totalInput = inputDecimal(amount);
  const [drafts, setDrafts] = useState<CheckoutRow[]>(() => [
    newRow("first", totalInput),
  ]);
  const split = drafts.length > 1;
  const rows =
    exact && !split ? [{ ...drafts[0], amount: totalInput }] : drafts;
  const allocation = paymentAllocation(
    amount,
    rows.map((row) => row.amount),
    exact,
  );
  const prepared = rows.map((row) => {
    const method =
      row.collector === "local"
        ? methods.find(({ id }) => id === row.methodId)
        : undefined;
    const reference =
      method?.kind === "transfer"
        ? transferReference(row.holder, row.reference)
        : row.reference.trim();
    return { row, method, reference };
  });
  const valid =
    allocation.valid &&
    prepared.every(({ row, method, reference }) => {
      if (reference.length > paymentReferenceLimit) return false;
      if (row.collector === "platform") return delivery;
      if (!method) return false;
      if (method.kind === "cash")
        return cashChange(row.received, row.amount).change !== null;
      if (method.kind === "card") return reference.length > 0;
      if (method.kind === "transfer") return row.verifiedAmount === row.amount;
      return true;
    });
  const cashRows = prepared
    .filter(({ method }) => method?.kind === "cash")
    .map(({ row }) => row);
  const cash = cashPaymentSummary(cashRows);
  const panel = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const notice = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!error && !uncertain) return;
    body.current?.scrollTo(0, 0);
    notice.current?.focus({ preventScroll: true });
  }, [error, uncertain, eventKey, canDiscard]);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const size = () => {
      const dialog = panel.current;
      if (!dialog) return;
      const { style } = dialog;
      // Mobile keyboards can shrink the visual viewport while leaving dvh unchanged.
      if (viewport.scale === 1 && viewport.height < window.innerHeight) {
        const height = `${viewport.height}px`;
        const heightChanged =
          style.getPropertyValue("--pos-payment-viewport-height") !== height;
        style.setProperty("--pos-payment-viewport-height", height);
        style.setProperty(
          "--pos-payment-viewport-top",
          `${viewport.offsetTop}px`,
        );
        const active = document.activeElement;
        if (
          heightChanged &&
          active instanceof HTMLInputElement &&
          dialog.contains(active)
        )
          active.scrollIntoView({ block: "nearest" });
      } else {
        style.removeProperty("--pos-payment-viewport-height");
        style.removeProperty("--pos-payment-viewport-top");
      }
    };
    size();
    viewport.addEventListener("resize", size);
    viewport.addEventListener("scroll", size);
    return () => {
      viewport.removeEventListener("resize", size);
      viewport.removeEventListener("scroll", size);
    };
  }, []);

  function editRow(key: string, changes: Partial<CheckoutRow>) {
    setDrafts((current) =>
      current.map((row) => (row.key === key ? { ...row, ...changes } : row)),
    );
  }

  function removeRow(key: string) {
    setDrafts((current) => {
      const next = current.filter((row) => row.key !== key);
      if (!exact || next.length !== 1) return next;
      const [row] = next;
      return [
        {
          ...row,
          amount: totalInput,
          verifiedAmount: row.amount === totalInput ? row.verifiedAmount : null,
        },
      ];
    });
  }

  function addRow() {
    if (rows.length >= 10) return;
    const nextAmount =
      allocation.remaining > 0n
        ? inputDecimal(cents(allocation.remaining))
        : "";
    setDrafts([...rows, newRow(crypto.randomUUID(), nextAmount)]);
  }

  function confirm() {
    if (locked || busy || !valid || checkoutIssue) return;
    onConfirm(
      prepared.map(({ row, method, reference }) => ({
        collector: row.collector,
        ...(method ? { methodId: method.id } : {}),
        amount: row.amount,
        reference,
      })),
      cash,
    );
  }

  const addButton = rows.length < 10 && (
    <Button
      type="button"
      variant="outline"
      className="pos-payment-add"
      onClick={addRow}
    >
      <Plus aria-hidden="true" />
      {split ? "Agregar pago" : "Dividir cobro"}
    </Button>
  );
  const methodStatus = (
    <MethodStatus
      loading={methodsLoading}
      error={methodsError}
      empty={methods.length === 0}
      canManage={canManageMethods}
      onRefresh={onRefreshMethods}
    />
  );

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !locked) onClose();
      }}
    >
      <DialogContent
        ref={panel}
        data-pos-payment
        className={`pos-surface pos-payment ${fontClassName} flex flex-col gap-0 overflow-hidden rounded-2xl p-0 sm:max-w-[900px]`}
        showCloseButton={!locked}
        onInteractOutside={(event) => {
          if (locked) event.preventDefault();
        }}
      >
        <DialogHeader className="pos-payment-header shrink-0 text-left">
          <DialogTitle>Registrar cobro</DialogTitle>
          <DialogDescription>
            {exact ? "Total de la venta" : "Saldo pendiente"} ·{" "}
            <strong>{money(amount)}</strong>
          </DialogDescription>
        </DialogHeader>

        <div
          ref={body}
          className="pos-payment-body min-h-0 flex-1 overflow-y-auto overscroll-contain"
        >
          {(error || uncertain) && (
            <div
              ref={notice}
              className="pos-payment-notices"
              tabIndex={-1}
              role="group"
              aria-label="Estado del cobro"
            >
              <OperationNotice
                persistentError
                canDiscard={canDiscard}
                onDiscard={onDiscard}
                eventKey={eventKey}
                error={error}
                uncertain={uncertain}
                busy={busy}
                retry={onRetry}
              />
            </div>
          )}
          <fieldset
            aria-label="Pagos"
            disabled={locked}
            className="pos-payment-rows"
          >
            {split &&
              rows.some((row) => row.collector === "local") &&
              methodStatus}
            {prepared.map(({ row, method, reference }, index) => {
              const position = index + 1;
              const cashOnly = !split && exact && method?.kind === "cash";
              const setReference = (value: string) =>
                editRow(row.key, { reference: value, verifiedAmount: null });
              return (
                <div
                  key={row.key}
                  className={split ? "pos-payment-row" : undefined}
                >
                  {split && (
                    <div className="pos-payment-row-header">
                      <h3>Pago {position}</h3>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        aria-label={`Quitar cobro ${position}`}
                        onClick={() => removeRow(row.key)}
                      >
                        <Trash2 size={18} aria-hidden="true" />
                      </Button>
                    </div>
                  )}
                  <div
                    className={
                      cashOnly
                        ? "pos-payment-columns pos-payment-single-cash"
                        : "pos-payment-columns"
                    }
                  >
                    <div className="pos-payment-choice">
                      {delivery && (
                        <Control label={`Cobrado por ${position}`} required>
                          <select
                            required
                            className={selectClass}
                            value={row.collector}
                            onChange={(event) =>
                              editRow(row.key, {
                                ...emptyMethodFields,
                                collector: event.target
                                  .value as PaymentDraft["collector"],
                              })
                            }
                          >
                            <option value="local">Kybo · cobro directo</option>
                            <option value="platform">La plataforma</option>
                          </select>
                        </Control>
                      )}
                      {row.collector === "local" && (
                        <>
                          {!split && methodStatus}
                          <MethodChoice
                            methods={methods}
                            methodId={method?.id}
                            position={position}
                            split={split}
                            onChange={(methodId) => {
                              if (methodId !== row.methodId)
                                editRow(row.key, {
                                  ...emptyMethodFields,
                                  methodId,
                                });
                            }}
                          />
                        </>
                      )}
                      {!split && addButton}
                    </div>
                    <div className="pos-payment-fields">
                      {(split || !exact) && (
                        <AppliedAmount
                          position={position}
                          amount={row.amount}
                          valid={allocation.applied[index] !== null}
                          onChange={(amount) =>
                            editRow(row.key, { amount, verifiedAmount: null })
                          }
                        />
                      )}
                      {row.collector === "platform" && (
                        <p className="pos-payment-help">
                          La plataforma cobró al cliente. La liquidación a Kybo
                          se concilia por separado.
                        </p>
                      )}
                      {method?.kind === "cash" && (
                        <CashPaymentFields
                          amount={row.amount}
                          received={row.received}
                          position={position}
                          split={split}
                          reference={row.reference}
                          onReference={setReference}
                          onReceived={(received) =>
                            editRow(row.key, { received })
                          }
                        />
                      )}
                      {method?.kind === "transfer" && (
                        <TransferPaymentFields
                          holder={row.holder}
                          reference={row.reference}
                          referenceTooLong={
                            reference.length > paymentReferenceLimit
                          }
                          verified={row.verifiedAmount === row.amount}
                          onHolder={(holder) =>
                            editRow(row.key, { holder, verifiedAmount: null })
                          }
                          onReference={setReference}
                          onVerified={(verified) =>
                            editRow(row.key, {
                              verifiedAmount: verified ? row.amount : null,
                            })
                          }
                        />
                      )}
                      {method?.kind === "card" && (
                        <CardPaymentField
                          label={
                            split
                              ? `Número de comprobante del pago ${position}`
                              : "Número de comprobante"
                          }
                          reference={row.reference}
                          focus={!split}
                          onReference={setReference}
                        />
                      )}
                      {(row.collector === "platform" ||
                        (method &&
                          method.kind !== "card" &&
                          method.kind !== "cash" &&
                          method.kind !== "transfer")) && (
                        <OptionalPaymentReference
                          position={position}
                          reference={row.reference}
                          onReference={setReference}
                        />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
            {split && addButton}
          </fieldset>
        </div>

        <div data-payment-footer className="pos-payment-footer shrink-0">
          {(split || !exact) && (
            <PaymentTotals
              amount={amount}
              assigned={allocation.assigned}
              remaining={allocation.remaining}
            />
          )}
          {checkoutIssue ? (
            <p className="pos-payment-field-error" role="status">
              {checkoutIssue}
            </p>
          ) : !exact || (!split && cashRows.length > 0) ? (
            <p
              className="pos-payment-help pos-payment-context"
              aria-live="polite"
            >
              {!exact && allocation.remaining > 0n && valid
                ? "La cuenta seguirá abierta."
                : cash && !split
                  ? `Recibido ${money(cash.received)} · Vuelto ${money(cash.change)}`
                  : null}
            </p>
          ) : null}
          <div className="pos-payment-actions">
            <Button
              type="button"
              variant="outline"
              disabled={locked}
              onClick={onClose}
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={locked || busy || !valid || !!checkoutIssue}
              onClick={confirm}
            >
              {busy ? (
                <>
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                  Guardando…
                </>
              ) : (
                <>
                  Confirmar cobro
                  <span aria-hidden="true">
                    · {money(cents(allocation.assigned))}
                  </span>
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
