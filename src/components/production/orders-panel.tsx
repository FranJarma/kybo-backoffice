"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocationSelect } from "@/components/branches/location-select";
import {
  getJson,
  useOperation,
  quantity,
  money,
} from "@/components/inventory/shared";
import { decimal } from "@/modules/inventory/decimal";
import type { RecipeDetail } from "@/modules/recipes/types";
import type { PreparationGuide } from "@/modules/recipes/preparation-guide";
import {
  localSchedule,
  scheduleInstant,
} from "@/modules/production/schedule-time";
import { OperationAlert } from "@/components/ui/operation-alert";
import { ReviewProductionResult } from "./review-result";
import type { ProductionResult } from "@/modules/production/result";
type Order = {
  outputItemId: string;
  result: ProductionResult | null;
  id: string;
  revision: number;
  state: string;
  name: string;
  baseUnit: string;
  plannedQuantity: string;
  actualQuantity: string | null;
  assignedTo: string | null;
  assignee: string | null;
  scheduledFor: string | null;
  notes: string | null;
  location: string;
  preparation: PreparationGuide | null;
  events: {
    action: string;
    at: string;
    actor: string;
    previousResult: ProductionResult | null;
    totalCost?: string | null;
    assignee: string | null;
    scheduledFor: string | null;
    reason: string | null;
    actualQuantity: string | null;
    consumption: { itemId: string; quantity: string }[] | null;
  }[];
  lots: {
    itemId: string;
    name: string;
    baseUnit: string;
    quantity: string;
    lotId: string;
    lotCode: string | null;
    expiresOn: string | null;
  }[];
  components: {
    itemId: string;
    name: string;
    baseUnit: string;
    reserved: string;
    untracked: boolean;
  }[];
};
export function ProductionOrdersPanel({
  actorId,
  recipe,
  timeZone,
  canManage,
}: {
  actorId: string;
  recipe: RecipeDetail | null;
  timeZone: string;
  canManage: boolean;
}) {
  const [assignees, setAssignees] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [mine, setMine] = useState(!canManage);
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  const [rows, setRows] = useState<Order[]>([]),
    [offset, setOffset] = useState(0),
    [scope, setScope] = useState("active"),
    [hasMore, setHasMore] = useState(false),
    [version, setVersion] = useState(0),
    [error, setError] = useState("");
  const saved = useCallback(() => {
    setVersion((v) => v + 1);
    setError("");
    setSuccess(
      `Orden actualizada correctamente. ${new Date().toLocaleTimeString("es-AR")}`,
    );
  }, []);
  const operation = useOperation<Record<string, unknown>>(
    actorId,
    "production-order",
    saved,
  );
  useEffect(() => {
    if (!canManage) return;
    let live = true;
    getJson<{ id: string; name: string }[]>("/api/production/assignees")
      .then((data) => {
        if (live) setAssignees(data);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [canManage]);
  useEffect(() => {
    let live = true;
    getJson<{ rows: Order[]; hasMore: boolean }>(
      `/api/production/orders?scope=${scope}&offset=${offset}&mine=${mine}`,
    )
      .then((r) => {
        if (live) {
          setRows(r.rows);
          setHasMore(r.hasMore);
          setLoading(false);
          setCheckedAt(Date.now());
        }
      })
      .catch((e) => {
        if (live) {
          setError(e.message);
          setLoading(false);
        }
      });
    return () => {
      live = false;
    };
  }, [version, scope, offset, mine]);
  return (
    <section className="surface-panel mb-6 space-y-4 p-5">
      <header>
        <h2 className="text-xl font-bold">
          {canManage ? "Órdenes de producción" : "Mis tareas de producción"}
        </h2>
        <p className="mt-1 text-sm text-muted">
          {canManage
            ? "Los materiales se reservan al iniciar la tarea. Al finalizar, registrá el consumo real y la cantidad obtenida."
            : "Consultá tus indicaciones y marcá comenzar o terminar. Si hubo alguna diferencia, avisale al encargado."}
        </p>
      </header>
      {success && (
        <OperationAlert title="Producción actualizada" message={success} />
      )}
      {(error || operation.error) && (
        <OperationAlert
          tone="error"
          title="No se pudo actualizar la producción"
          message={error || operation.error}
        />
      )}
      {operation.uncertain && (
        <Button onClick={operation.retry}>Reintentar el mismo envío</Button>
      )}
      {canManage && recipe && (
        <ConfirmOrder
          key={recipe.versionId}
          recipe={recipe}
          locked={operation.locked}
          submit={operation.submit}
          assignees={assignees}
          timeZone={timeZone}
        />
      )}
      <div className="space-y-4">
        {canManage && (
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
              <option value="active">Pendientes y en curso</option>
              <option value="history">Historial</option>
            </select>
          </label>
        )}
        {canManage && (
          <label className="ml-4 inline-flex gap-2 text-sm">
            <input
              type="checkbox"
              checked={mine}
              onChange={(e) => {
                setMine(e.target.checked);
                setOffset(0);
              }}
            />
            Solo mis tareas
          </label>
        )}
        <Button
          variant="outline"
          disabled={operation.locked}
          onClick={() => {
            setLoading(true);
            setVersion((v) => v + 1);
          }}
        >
          Actualizar
        </Button>
        {loading && (
          <p role="status" className="text-sm text-muted">
            Cargando órdenes…
          </p>
        )}
        {rows.map((row) => (
          <article
            key={`${row.id}:${row.revision}`}
            className="rounded-xl border border-line p-5 space-y-4"
          >
            <header className="flex flex-wrap justify-between gap-3">
              <div>
                <h3 className="font-semibold">
                  {row.name} · {quantity(row.plannedQuantity, row.baseUnit)}
                </h3>
                <p className="text-sm text-muted">
                  {row.assignee ?? "Sin responsable asignado"} · {row.location}
                </p>
              </div>
              <span className="text-sm font-medium">
                {
                  {
                    planned: "Planificada",
                    confirmed: "En curso",
                    completed: "Finalizada",
                    cancelled: "Anulada",
                  }[row.state]
                }
              </span>
            </header>
            {row.scheduledFor && (
              <p className="text-sm">
                Para el{" "}
                {new Intl.DateTimeFormat("es-AR", {
                  timeZone,
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(row.scheduledFor))}
                {["planned", "confirmed"].includes(row.state) &&
                  new Date(row.scheduledFor).getTime() < checkedAt && (
                    <span className="ml-3 font-medium text-amber-700">
                      Atrasada
                    </span>
                  )}
              </p>
            )}
            {row.notes && (
              <p className="whitespace-pre-wrap text-sm">{row.notes}</p>
            )}
            <details className="text-sm">
              <summary className="cursor-pointer font-medium">
                Ver receta e instrucciones
              </summary>
              <ul className="my-3 space-y-2">
                {row.components.map((c) => (
                  <li key={c.itemId}>
                    {c.name}: {quantity(c.reserved, c.baseUnit)}
                    {c.untracked ? " · sin control de stock" : ""}
                  </li>
                ))}
              </ul>
              {row.preparation?.estimatedMinutes && (
                <p>Tiempo estimado: {row.preparation.estimatedMinutes} min</p>
              )}
              <ol className="list-decimal pl-5 space-y-2">
                {row.preparation?.steps.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ol>
              {row.preparation?.observations && (
                <p className="mt-3 whitespace-pre-wrap">
                  {row.preparation.observations}
                </p>
              )}
            </details>
            {row.state === "planned" && (
              <Button
                disabled={operation.locked}
                onClick={() =>
                  operation.submit(`/api/production/orders/${row.id}`, {
                    requestId: crypto.randomUUID(),
                    start: { expectedRevision: row.revision },
                  })
                }
              >
                {canManage ? "Iniciar preparación" : "Comenzar"}
              </Button>
            )}
            {canManage && ["planned", "confirmed"].includes(row.state) && (
              <EditPlanning
                order={row}
                assignees={assignees}
                timeZone={timeZone}
                locked={operation.locked}
                submit={operation.submit}
              />
            )}
            {row.state === "confirmed" && !canManage ? (
              <div className="space-y-2">
                <Button
                  disabled={operation.locked}
                  onClick={() =>
                    operation.submit(`/api/production/orders/${row.id}`, {
                      requestId: crypto.randomUUID(),
                      completion: { expectedRevision: row.revision },
                    })
                  }
                >
                  Terminar
                </Button>
                <p className="text-xs text-muted">
                  Se registrarán {quantity(row.plannedQuantity, row.baseUnit)}{" "}
                  según lo previsto. Las diferencias las registra el encargado.
                </p>
              </div>
            ) : row.state === "confirmed" ? (
              <FinishOrder
                key={`${row.id}:${row.revision}`}
                order={row}
                locked={operation.locked}
                submit={operation.submit}
                canManage={canManage}
              />
            ) : row.state !== "planned" ? (
              <p key={row.id} className="border-t pt-3 text-sm">
                {row.name} ·{" "}
                {row.state === "completed" ? "Finalizada" : "Anulada"}
                {row.actualQuantity
                  ? ` · ${quantity(row.actualQuantity, row.baseUnit)}`
                  : ""}
              </p>
            ) : null}
            {canManage &&
              row.result &&
              ["completed", "cancelled"].includes(row.state) && (
                <ReviewProductionResult
                  orderId={row.id}
                  revision={row.revision}
                  baseUnit={row.baseUnit}
                  result={row.result}
                  components={row.components}
                  locked={operation.locked}
                  submit={operation.submit}
                />
              )}
            {canManage && row.events.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium">
                  Historial de la orden
                </summary>
                <ol className="mt-3 space-y-3">
                  {row.events.map((event, i) => (
                    <li key={i}>
                      <p>
                        {{
                          plan: "Planificó",
                          start: "Inició",
                          revise: "Modificó la planificación",
                          finish: "Finalizó",
                          "review-result": "Revisó el resultado",
                          "cancel-planned": "Anuló",
                          "cancel-unused": "Anuló sin consumo",
                          "cancel-consumed": "Registró pérdida total",
                        }[event.action] ?? event.action}{" "}
                        · {event.actor} ·{" "}
                        {new Intl.DateTimeFormat("es-AR", {
                          timeZone,
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(new Date(event.at))}
                      </p>
                      {event.reason && (
                        <p className="text-muted whitespace-pre-wrap">
                          {event.reason}
                        </p>
                      )}
                      {event.previousResult && (
                        <div className="text-muted">
                          <p>
                            Producción anterior:{" "}
                            {quantity(
                              event.previousResult.actualQuantity,
                              row.baseUnit,
                            )}
                          </p>
                          <p>
                            Costo anterior:{" "}
                            {money(event.previousResult.totalCost)} · costo
                            revisado: {money(event.totalCost ?? null)}
                          </p>
                          {event.previousResult.consumption.map((c) => {
                            const item = row.components.find(
                              (p) => p.itemId === c.itemId,
                            );
                            return (
                              <p key={c.itemId}>
                                Consumo anterior de {item?.name}:{" "}
                                {quantity(c.quantity, item?.baseUnit ?? "unit")}
                              </p>
                            );
                          })}
                        </div>
                      )}
                      {event.assignee && (
                        <p className="text-muted">
                          Responsable: {event.assignee}
                        </p>
                      )}
                      {event.scheduledFor && (
                        <p className="text-muted">
                          Plazo:{" "}
                          {new Intl.DateTimeFormat("es-AR", {
                            timeZone,
                            dateStyle: "short",
                            timeStyle: "short",
                          }).format(new Date(event.scheduledFor))}
                        </p>
                      )}
                      {event.actualQuantity && (
                        <p>
                          Obtenido:{" "}
                          {quantity(event.actualQuantity, row.baseUnit)} ·
                          previsto:{" "}
                          {quantity(row.plannedQuantity, row.baseUnit)}
                        </p>
                      )}
                      {event.consumption?.map((c) => {
                        const item = row.components.find(
                          (x) => x.itemId === c.itemId,
                        );
                        return (
                          <p key={c.itemId} className="text-muted">
                            {item?.name}:{" "}
                            {quantity(c.quantity, item?.baseUnit ?? "unit")}
                          </p>
                        );
                      })}
                    </li>
                  ))}
                </ol>
              </details>
            )}
            {canManage && row.lots.length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer font-medium">
                  Lotes consumidos y producidos
                </summary>
                <ul className="mt-3 space-y-2">
                  {row.lots.map((lot, i) => (
                    <li key={i}>
                      {lot.itemId === row.outputItemId
                        ? lot.quantity.startsWith("-")
                          ? "Corrección del producido"
                          : "Producido"
                        : lot.quantity.startsWith("-")
                          ? "Consumido"
                          : "Ingrediente devuelto"}
                      : {lot.name} ·{" "}
                      {quantity(lot.quantity.replace("-", ""), lot.baseUnit)} ·
                      lote {lot.lotCode ?? lot.lotId.slice(0, 8)}
                      {lot.expiresOn ? ` · vence ${lot.expiresOn}` : ""}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </article>
        ))}
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
      {!loading && rows.length === 0 && (
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
  assignees,
  timeZone,
}: {
  recipe: RecipeDetail;
  locked: boolean;
  submit: (url: string, payload: Record<string, unknown>) => void;
  assignees: { id: string; name: string }[];
  timeZone: string;
}) {
  const [assignedTo, setAssignedTo] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState(""),
    [planned, setPlanned] = useState(recipe.yieldQuantity.replace(".", ",")),
    [choices, setChoices] = useState<Record<string, string>>(() =>
      Object.fromEntries(
        recipe.lines
          .filter(
            (l) =>
              !l.optional && l.options.length === 1 && !l.options[0].archived,
          )
          .map((l) => [l.id, l.options[0].id]),
      ),
    ),
    [error, setError] = useState("");
  function save(e: FormEvent) {
    e.preventDefault();
    try {
      submit("/api/production/orders", {
        requestId: crypto.randomUUID(),
        assignment: {
          assignedTo,
          scheduledFor: scheduleInstant(scheduledFor, timeZone),
          notes,
        },
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
        <label className="text-sm">
          Responsable
          <select
            required
            className="mt-1 block w-full rounded border p-3"
            value={assignedTo}
            onChange={(e) => setAssignedTo(e.target.value)}
          >
            <option value="">Elegí una persona</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm">
          Debe estar listo para
          <Input
            required
            type="datetime-local"
            value={scheduledFor}
            onChange={(e) => setScheduledFor(e.target.value)}
          />
          <span className="text-xs text-muted">
            Hora de la sucursal ({timeZone})
          </span>
        </label>
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
        <label className="text-sm md:col-span-2">
          Indicaciones para el responsable
          <textarea
            className="mt-1 w-full rounded border p-3"
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <Button type="submit">Asignar producción</Button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
function FinishOrder({
  order,
  locked,
  submit,
  canManage,
}: {
  order: Order;
  locked: boolean;
  submit: (url: string, payload: Record<string, unknown>) => void;
  canManage: boolean;
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
              {c.untracked ? "Previsto, sin stock" : "Reservado"}:{" "}
              {quantity(c.reserved, c.baseUnit)}
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
        {canManage && (
          <>
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
          </>
        )}
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

function EditPlanning({
  order,
  assignees,
  timeZone,
  locked,
  submit,
}: {
  order: Order;
  assignees: { id: string; name: string }[];
  timeZone: string;
  locked: boolean;
  submit: (url: string, payload: Record<string, unknown>) => void;
}) {
  const [assignedTo, setAssignedTo] = useState(order.assignedTo ?? "");
  const [scheduledFor, setScheduledFor] = useState(
    order.scheduledFor ? localSchedule(order.scheduledFor, timeZone) : "",
  );
  const [planned, setPlanned] = useState(
    order.plannedQuantity.replace(".", ","),
  );
  const [notes, setNotes] = useState(order.notes ?? "");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  function save(e: FormEvent) {
    e.preventDefault();
    try {
      submit(`/api/production/orders/${order.id}`, {
        requestId: crypto.randomUUID(),
        planning: {
          expectedRevision: order.revision,
          assignedTo,
          scheduledFor: scheduleInstant(scheduledFor, timeZone),
          notes,
          reason,
          plannedQuantity: decimal(planned, 6, true, true),
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revisá los datos.");
    }
  }
  return (
    <details className="text-sm">
      <summary className="cursor-pointer font-medium">
        Reasignar, reprogramar o anular
      </summary>
      <form onSubmit={save} className="mt-4">
        <fieldset disabled={locked} className="grid gap-5 md:grid-cols-2">
          <label>
            Responsable
            <select
              required
              className="mt-1 block w-full rounded border p-3"
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
            >
              <option value="">Elegí una persona</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Debe estar listo para
            <Input
              required
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
            />
            <span className="text-xs text-muted">
              Hora de la sucursal ({timeZone})
            </span>
          </label>
          <label>
            Cantidad prevista ({order.baseUnit})
            <Input
              required
              disabled={order.state !== "planned"}
              inputMode="decimal"
              value={planned}
              onChange={(e) => setPlanned(e.target.value)}
            />
          </label>
          <label>
            Indicaciones
            <textarea
              className="w-full rounded border p-3"
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <label className="md:col-span-2">
            Motivo del cambio o anulación
            <Input
              required
              maxLength={2000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <Button type="submit" variant="outline">
            Guardar planificación
          </Button>
          {order.state === "planned" && (
            <Button
              type="button"
              variant="outline"
              disabled={!reason.trim()}
              onClick={() =>
                submit(`/api/production/orders/${order.id}`, {
                  requestId: crypto.randomUUID(),
                  cancelPlan: { expectedRevision: order.revision, reason },
                })
              }
            >
              Anular planificación
            </Button>
          )}
        </fieldset>
        {error && <p role="alert">{error}</p>}
      </form>
    </details>
  );
}
