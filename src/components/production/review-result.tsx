"use client";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { quantity, money } from "@/components/inventory/shared";
import { decimal, integer, six } from "@/modules/inventory/decimal";
import type { ProductionResult } from "@/modules/production/result";

const editable = (value: string) =>
  value.replace(/(\.\d*?[1-9])0+$|\.0+$/, "$1").replace(".", ",");
function difference(value: string, previous: string, unit: string) {
  try {
    const delta = integer(decimal(value, 6)!) - integer(previous);
    return `${delta > 0n ? "+" : ""}${quantity(six(delta), unit)}`;
  } catch {
    return "—";
  }
}
export function ReviewProductionResult({
  orderId,
  revision,
  baseUnit,
  result,
  components,
  locked,
  submit,
}: {
  orderId: string;
  revision: number;
  baseUnit: string;
  result: ProductionResult;
  components: {
    itemId: string;
    name: string;
    baseUnit: string;
    untracked: boolean;
  }[];
  locked: boolean;
  submit: (url: string, payload: Record<string, unknown>) => void;
}) {
  const [actual, setActual] = useState(editable(result.actualQuantity));
  const [amounts, setAmounts] = useState(() =>
    Object.fromEntries(
      result.consumption.map((c) => [c.itemId, editable(c.quantity)]),
    ),
  );
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  function save(e: FormEvent) {
    e.preventDefault();
    try {
      const payload = {
        expectedRevision: revision,
        actualQuantity: decimal(actual, 6),
        consumption: components.map((c) => ({
          itemId: c.itemId,
          quantity: decimal(amounts[c.itemId] ?? "0", 6),
        })),
        reason,
      };
      setError("");
      submit(`/api/production/orders/${orderId}`, {
        requestId: crypto.randomUUID(),
        review: payload,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revisá las cantidades.");
    }
  }
  return (
    <details className="rounded-lg border border-line p-4 text-sm">
      <summary className="cursor-pointer font-semibold text-blue-700">
        Revisar resultado
      </summary>
      <p className="mt-3 text-muted">
        Ingresá los totales reales, no la diferencia. Se ajustará únicamente lo
        que cambió, conservando el registro original.
      </p>
      <p className="mt-2 text-muted">
        Costo registrado: {money(result.totalCost)}
        {result.quantitySource === "planned"
          ? " · cantidades calculadas automáticamente"
          : ""}
      </p>
      <form onSubmit={save} className="mt-5">
        <fieldset disabled={locked} className="space-y-6">
          <label className="block">
            Total producido ({baseUnit})
            <Input
              required
              inputMode="decimal"
              value={actual}
              onChange={(e) => setActual(e.target.value)}
            />
            <span className="text-xs text-muted">
              Registrado: {quantity(result.actualQuantity, baseUnit)} · cambio:{" "}
              {difference(actual, result.actualQuantity, baseUnit)}
            </span>
          </label>
          <div className="grid gap-5 md:grid-cols-2">
            {components.map((c) => (
              <label key={c.itemId} className="block">
                Total utilizado: {c.name} ({c.baseUnit})
                <Input
                  required
                  inputMode="decimal"
                  value={amounts[c.itemId] ?? "0"}
                  onChange={(e) =>
                    setAmounts((p) => ({ ...p, [c.itemId]: e.target.value }))
                  }
                />
                <span className="text-xs text-muted">
                  Registrado:{" "}
                  {quantity(
                    result.consumption.find((p) => p.itemId === c.itemId)
                      ?.quantity ?? "0",
                    c.baseUnit,
                  )}{" "}
                  · cambio:{" "}
                  {difference(
                    amounts[c.itemId] ?? "0",
                    result.consumption.find((p) => p.itemId === c.itemId)
                      ?.quantity ?? "0",
                    c.baseUnit,
                  )}
                  {c.untracked ? " · sin movimiento de stock" : ""}
                </span>
              </label>
            ))}
          </div>
          <label className="block">
            Motivo de la revisión
            <textarea
              required
              maxLength={2000}
              className="mt-1 w-full rounded-lg border border-line p-3"
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <p className="text-xs text-muted">
            Si el total producido es cero, se registrará una pérdida total. Los
            ingredientes indicados seguirán registrados como consumidos. La
            revisión requiere que el stock producido no haya sido utilizado ni
            reservado.
          </p>
          <Button type="submit">
            Confirmar revisión y ajustar diferencias
          </Button>
        </fieldset>
        {error && (
          <p role="alert" className="mt-3 text-red-700">
            {error}
          </p>
        )}
      </form>
    </details>
  );
}
