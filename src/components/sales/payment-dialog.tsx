"use client";
import { useState } from "react";
import { Plus, Trash2, WalletCards } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { money } from "@/components/inventory/shared";
import { inputDecimal } from "@/components/recipes/shared";
import { cents, decimal, integer } from "@/modules/inventory/decimal";
import { Control, LookupSelect, selectClass, OperationNotice } from "./shared";
export type PaymentDraft = {
  collector: "local" | "platform";
  methodId?: string;
  amount: string;
  reference: string;
};
export function PaymentDialog({
  amount,
  delivery,
  exact,
  locked,
  busy,
  error,
  uncertain,
  onRetry,
  onClose,
  onConfirm,
}: {
  amount: string;
  delivery: boolean;
  exact: boolean;
  locked: boolean;
  busy: boolean;
  error: string;
  uncertain: boolean;
  onRetry: () => void;
  onClose: () => void;
  onConfirm: (payments: PaymentDraft[]) => void;
}) {
  const [rows, setRows] = useState<(PaymentDraft & { key: string })[]>([
    {
      key: "first",
      collector: "local",
      methodId: "",
      amount: inputDecimal(amount),
      reference: "",
    },
  ]);
  let paid = 0n,
    valid = true;
  try {
    for (const row of rows) {
      paid += integer(decimal(row.amount, 2, true, true)!);
      if (row.collector === "local" && !row.methodId) valid = false;
    }
  } catch {
    valid = false;
  }
  const due = integer(amount),
    remaining = due - paid;
  valid = valid && paid > 0n && paid <= due && (!exact || remaining === 0n);
  const change = (index: number, values: Partial<PaymentDraft>) =>
    setRows((current) =>
      current.map((r, i) => (i === index ? { ...r, ...values } : r)),
    );
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !locked) onClose();
      }}
    >
      <DialogContent
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
        showCloseButton={!locked}
        onInteractOutside={(e) => {
          if (locked) e.preventDefault();
        }}
      >
        <DialogHeader>
          <span className="icon-tile-warm mb-2">
            <WalletCards size={21} />
          </span>
          <DialogTitle>Registrar cobro</DialogTitle>
          <DialogDescription>
            Registrá pagos ya realizados. Kybo no procesa tarjetas ni verifica
            transferencias.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center justify-between rounded-xl bg-surface p-4">
          <span className="text-sm text-muted">
            {exact ? "Total de la venta" : "Saldo pendiente"}
          </span>
          <strong className="text-2xl tabular-nums text-brand">
            {money(amount)}
          </strong>
        </div>
        <OperationNotice
          error={error}
          uncertain={uncertain}
          busy={busy}
          retry={onRetry}
        />
        <fieldset disabled={locked} className="space-y-4">
          {rows.map((row, i) => (
            <div
              key={row.key}
              className="space-y-3 rounded-xl border border-line p-4"
            >
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-brand">Cobro {i + 1}</p>
                {rows.length > 1 && (
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Quitar cobro ${i + 1}`}
                    onClick={() => setRows(rows.filter((_, j) => i !== j))}
                  >
                    <Trash2 size={16} />
                  </Button>
                )}
              </div>
              {delivery && (
                <Control label={`Cobrado por ${i + 1}`}>
                  <select
                    className={selectClass}
                    value={row.collector}
                    onChange={(e) =>
                      change(i, {
                        collector: e.target.value as PaymentDraft["collector"],
                        methodId: "",
                      })
                    }
                  >
                    <option value="local">Kybo · cobro directo</option>
                    <option value="platform">La plataforma</option>
                  </select>
                </Control>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                {row.collector === "local" ? (
                  <LookupSelect
                    kind="payment-methods"
                    label={`Medio de pago ${i + 1}`}
                    value={row.methodId ?? ""}
                    disabled={locked}
                    onChange={(value) => change(i, { methodId: value })}
                  />
                ) : (
                  <div className="rounded-lg bg-blue-50 p-3 text-xs leading-relaxed text-blue-900">
                    Cobrado al cliente por la plataforma. La liquidación a Kybo
                    se concilia por separado.
                  </div>
                )}
                <Control label={`Importe ${i + 1}`}>
                  <Input
                    value={row.amount}
                    inputMode="decimal"
                    onChange={(e) => change(i, { amount: e.target.value })}
                  />
                </Control>
              </div>
              <Control label={`Referencia ${i + 1}`}>
                <Input
                  value={row.reference}
                  maxLength={120}
                  placeholder="Comprobante externo u operación (opcional)"
                  onChange={(e) => change(i, { reference: e.target.value })}
                />
              </Control>
            </div>
          ))}
          {rows.length < 10 && (
            <Button
              variant="outline"
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
              <Plus size={16} />
              Dividir cobro
            </Button>
          )}
        </fieldset>
        <p
          className={`text-sm ${remaining < 0n ? "text-red-700" : "text-muted"}`}
        >
          {remaining < 0n
            ? `El importe supera el saldo por ${money(cents(-remaining))}.`
            : remaining > 0n
              ? `Quedan ${money(cents(remaining))} ${exact ? "por completar para confirmar." : "pendientes; la cuenta seguirá abierta."}.`
              : "El cobro cubre el total."}
        </p>
        <Button
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
          {busy ? "Guardando…" : "Confirmar cobro"}
        </Button>
      </DialogContent>
    </Dialog>
  );
}
