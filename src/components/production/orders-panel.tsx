"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocationSelect } from "@/components/branches/location-select";
import { getJson, useOperation, quantity } from "@/components/inventory/shared";
import { decimal } from "@/modules/inventory/decimal";
import type { RecipeDetail } from "@/modules/recipes/types";
type Order = {
  id: string;
  revision: number;
  state: string;
  name: string;
  baseUnit: string;
  plannedQuantity: string;
  actualQuantity: string | null;
  components: {
    itemId: string;
    name: string;
    baseUnit: string;
    reserved: string;
  }[];
};
export function ProductionOrdersPanel({
  actorId,
  recipe,
}: {
  actorId: string;
  recipe: RecipeDetail | null;
}) {
  const [rows, setRows] = useState<Order[]>([]),
    [offset, setOffset] = useState(0),
    [scope, setScope] = useState("active"),
    [hasMore, setHasMore] = useState(false),
    [version, setVersion] = useState(0),
    [error, setError] = useState("");
  const saved = useCallback(() => {
    setVersion((v) => v + 1);
    setError("");
  }, []);
  const operation = useOperation<Record<string, unknown>>(
    actorId,
    "production-order",
    saved,
  );
  useEffect(() => {
    let live = true;
    getJson<{ rows: Order[]; hasMore: boolean }>(
      `/api/production/orders?scope=${scope}&offset=${offset}`,
    )
      .then((r) => {
        if (live) {
          setRows(r.rows);
          setHasMore(r.hasMore);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [version, scope, offset]);
  return (
    <section className="surface-panel mb-6 space-y-4 p-5">
      <header>
        <h2 className="text-xl font-bold">Producción planificada</h2>
        <p className="mt-1 text-sm text-muted">
          Confirmá antes de comenzar para reservar los materiales. Al terminar,
          registrá cuánto utilizaste y cuánto obtuviste.
        </p>
      </header>
      {(error || operation.error) && (
        <p role="alert" className="text-red-700">
          {error || operation.error}
        </p>
      )}
      {operation.uncertain && (
        <Button onClick={operation.retry}>Reintentar el mismo envío</Button>
      )}
      {recipe && (
        <ConfirmOrder
          key={recipe.versionId}
          recipe={recipe}
          locked={operation.locked}
          submit={operation.submit}
        />
      )}
      <div className="space-y-4">
        <label className="text-sm">
          Ver órdenes
          <select
            className="ml-3 rounded border p-2"
            value={scope}
            onChange={(e) => {
              setScope(e.target.value);
              setOffset(0);
            }}
          >
            <option value="active">En curso</option>
            <option value="history">Historial</option>
          </select>
        </label>
        {rows.map((row) =>
          row.state === "confirmed" ? (
            <FinishOrder
              key={`${row.id}:${row.revision}`}
              order={row}
              locked={operation.locked}
              submit={operation.submit}
            />
          ) : (
            <p key={row.id} className="border-t pt-3 text-sm">
              {row.name} ·{" "}
              {row.state === "completed" ? "Finalizada" : "Anulada"}
              {row.actualQuantity
                ? ` · ${quantity(row.actualQuantity, row.baseUnit)}`
                : ""}
            </p>
          ),
        )}
      </div>
      <div className="flex gap-3">
        <Button
          variant="outline"
          disabled={offset === 0 || operation.locked}
          onClick={() => setOffset((n) => Math.max(0, n - 100))}
        >
          Anteriores
        </Button>
        <Button
          variant="outline"
          disabled={!hasMore || operation.locked}
          onClick={() => setOffset((n) => n + 100)}
        >
          Siguientes
        </Button>
      </div>
      {rows.length === 0 && (
        <p className="text-sm text-muted">
          No hay órdenes de producción registradas.
        </p>
      )}
    </section>
  );
}
function ConfirmOrder({
  recipe,
  locked,
  submit,
}: {
  recipe: RecipeDetail;
  locked: boolean;
  submit: (url: string, payload: Record<string, unknown>) => void;
}) {
  const [location, setLocation] = useState(""),
    [planned, setPlanned] = useState(recipe.yieldQuantity.replace(".", ",")),
    [choices, setChoices] = useState<Record<string, string>>({}),
    [error, setError] = useState("");
  function save(e: FormEvent) {
    e.preventDefault();
    try {
      submit("/api/production/orders", {
        requestId: crypto.randomUUID(),
        order: {
          recipeVersionId: recipe.versionId,
          locationId: location,
          plannedQuantity: decimal(planned, 6, true, true),
          selections: recipe.lines.map((l) => ({
            lineId: l.id,
            optionId: choices[l.id] || null,
          })),
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revisá los datos.");
    }
  }
  return (
    <form className="space-y-3 border-t pt-4" onSubmit={save}>
      <h3 className="font-semibold">Planificar {recipe.name}</h3>
      <fieldset disabled={locked} className="grid gap-3 md:grid-cols-2">
        <LocationSelect value={location} onChange={setLocation} />
        <label className="text-sm">
          Cantidad prevista ({recipe.baseUnit})
          <Input
            required
            inputMode="decimal"
            value={planned}
            onChange={(e) => setPlanned(e.target.value)}
          />
        </label>
        {recipe.lines.map((line, i) => (
          <label key={line.id} className="text-sm">
            Componente {i + 1}
            {line.optional ? " · opcional" : ""}
            <select
              required={!line.optional}
              value={choices[line.id] ?? ""}
              onChange={(e) =>
                setChoices((p) => ({ ...p, [line.id]: e.target.value }))
              }
              className="mt-1 block w-full rounded border p-2"
            >
              <option value="">
                {line.optional ? "No utilizar" : "Elegí una alternativa"}
              </option>
              {line.options
                .filter((o) => !o.archived)
                .map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
            </select>
          </label>
        ))}
        <Button type="submit">Confirmar y reservar materiales</Button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
function FinishOrder({
  order,
  locked,
  submit,
}: {
  order: Order;
  locked: boolean;
  submit: (url: string, payload: Record<string, unknown>) => void;
}) {
  const [unusedConfirmed, setUnusedConfirmed] = useState(false),
    [lost, setLost] = useState(false);
  const [actual, setActual] = useState(order.plannedQuantity.replace(".", ",")),
    [amounts, setAmounts] = useState<Record<string, string>>({}),
    [expiry, setExpiry] = useState(""),
    [lotCode, setLotCode] = useState(""),
    [reason, setReason] = useState(""),
    [error, setError] = useState("");
  function save(e: FormEvent) {
    e.preventDefault();
    try {
      submit(`/api/production/orders/${order.id}`, {
        requestId: crypto.randomUUID(),
        completion: {
          expectedRevision: order.revision,
          actualQuantity: lost ? null : decimal(actual, 6, true, true),
          outcome: lost ? "cancelled" : "completed",
          expiresOn: lost ? null : expiry || null,
          lotCode: lost ? null : lotCode || null,
          reason,
          consumption: order.components.map((c) => ({
            itemId: c.itemId,
            quantity: decimal(
              amounts[c.itemId] ?? c.reserved.replace(".", ","),
              6,
            ),
          })),
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revisá las cantidades.");
    }
  }
  return (
    <form className="space-y-3 border-t pt-4" onSubmit={save}>
      <h3 className="font-semibold">{order.name} · materiales reservados</h3>
      <label className="flex gap-2 text-sm">
        <input
          type="checkbox"
          checked={lost}
          onChange={(e) => setLost(e.target.checked)}
          disabled={locked}
        />
        Pérdida total: registrar lo consumido sin ingresar producto terminado
      </label>
      <fieldset disabled={locked} className="grid gap-3 md:grid-cols-2">
        {order.components.map((c) => (
          <label key={c.itemId} className="text-sm">
            Consumido: {c.name} ({c.baseUnit})
            <Input
              inputMode="decimal"
              required
              value={amounts[c.itemId] ?? c.reserved.replace(".", ",")}
              onChange={(e) =>
                setAmounts((p) => ({ ...p, [c.itemId]: e.target.value }))
              }
            />
            <span className="text-xs text-muted">
              Reservado: {quantity(c.reserved, c.baseUnit)}
            </span>
          </label>
        ))}
        <label className="text-sm">
          Producción obtenida ({order.baseUnit})
          <Input
            required
            inputMode="decimal"
            disabled={lost}
            value={actual}
            onChange={(e) => setActual(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Vencimiento
          <Input
            type="date"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Código de lote
          <Input
            maxLength={120}
            value={lotCode}
            onChange={(e) => setLotCode(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Notas de finalización y diferencias
          <Input
            required
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <Button type="submit">
          {lost ? "Registrar pérdida total" : "Finalizar producción"}
        </Button>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={unusedConfirmed}
            onChange={(e) => setUnusedConfirmed(e.target.checked)}
          />
          Confirmo que no se consumió ningún material
        </label>
        <Button
          type="button"
          variant="outline"
          disabled={!unusedConfirmed || !reason.trim()}
          onClick={() =>
            submit(`/api/production/orders/${order.id}`, {
              requestId: crypto.randomUUID(),
              cancellation: {
                expectedRevision: order.revision,
                reason,
                unusedConfirmed: true,
              },
            })
          }
        >
          Anular sin consumo y liberar reserva
        </Button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
