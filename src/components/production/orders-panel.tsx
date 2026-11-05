"use client";
import { useErrorFeedback } from "@/components/ui/use-error-feedback";
import { FieldCaption } from "@/components/ui/field-caption";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
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
import { ProductionDifferenceForm } from "./difference-form";
import { useLiveProductionOrders } from "./use-live-orders";
import type { ProductionDifference } from "@/modules/production/difference";
import type { ProductionResult } from "@/modules/production/result";
import { AssigneeField } from "./assignee-field";
import { SearchCombobox } from "@/components/ui/search-combobox";
import { Field, inputDecimal } from "@/components/recipes/shared";
import {
  ClipboardList,
  Clock3,
  PackageCheck,
  RefreshCw,
  X,
} from "lucide-react";
import styles from "./production.module.css";

type Order = {
  difference?: ProductionDifference | null;
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
  fixedScope,
  planningOpen = !!recipe,
  planningPicker,
  preparationReady = true,
  onPlanningClose,
  onBusy,
  externallyLocked = false,
}: {
  actorId: string;
  recipe: RecipeDetail | null;
  timeZone: string;
  canManage: boolean;
  fixedScope?: "active" | "history";
  planningOpen?: boolean;
  planningPicker?: ReactNode;
  preparationReady?: boolean;
  onPlanningClose?: () => void;
  onBusy?: (busy: boolean) => void;
  externallyLocked?: boolean;
}) {
  const assigning = useRef(false);
  const [assignees, setAssignees] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [mine, setMine] = useState(!canManage);
  const [success, setSuccess] = useState("");
  const [offsets, setOffsets] = useState({ active: 0, history: 0 }),
    [localScope, setScope] = useState<"active" | "history">("active"),
    [version, setVersion] = useState(0),
    [error, setError, errorAttempt] = useErrorFeedback();
  const scope = fixedScope ?? localScope;
  const offset = offsets[scope];
  function setOffset(value: number | ((current: number) => number)) {
    setOffsets((current) => ({
      ...current,
      [scope]: typeof value === "function" ? value(current[scope]) : value,
    }));
  }
  const {
    known: knownOrders,
    rows: visibleRows,
    hasMore,
    clock: checkedAt,
    acceptSaved,
    fresh: feedFresh,
    loading: feedLoading,
    refreshing: feedRefreshing,
    error: feedError,
    missing: missingOrders,
    markEdited,
    applyLatest,
    setPanel: ordersPanelRef,
    revealReview,
  } = useLiveProductionOrders<Order>(
    `/api/production/orders?scope=${scope}&offset=${offset}&mine=${mine}`,
    version,
    scope === "active",
  );
  const visibleIds = new Set(visibleRows.map((row) => row.id));
  const renderedRows = [
    ...visibleRows.map((row) => knownOrders[row.id] ?? row),
    ...Object.values(knownOrders).filter((row) => !visibleIds.has(row.id)),
  ];
  const fetching = feedLoading || feedRefreshing;
  const reviews = visibleRows.filter(
    (row) => row.state === "confirmed" && row.difference,
  );
  const saved = useCallback(
    (result: unknown) => {
      acceptSaved(result);
      if (assigning.current) {
        assigning.current = false;
        onPlanningClose?.();
      }
      setVersion((v) => v + 1);
      setError("");
      setSuccess(
        `Orden actualizada correctamente. ${new Date().toLocaleTimeString("es-AR")}`,
      );
    },
    [setError, onPlanningClose, acceptSaved],
  );
  const operation = useOperation<Record<string, unknown>>(
    actorId,
    "production-order",
    saved,
  );
  const locked = operation.locked || externallyLocked || !feedFresh;
  useEffect(() => {
    onBusy?.(operation.locked);
  }, [operation.locked, onBusy]);
  useEffect(() => {
    if (!canManage || fixedScope === "history") return;
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
  }, [canManage, fixedScope, setError]);
  return (
    <div ref={ordersPanelRef}>
      {canManage && planningOpen && (
        <section
          className={styles.planning}
          aria-label="Planificar producción"
          hidden={scope === "history"}
        >
          <header className={styles.sectionHeading}>
            <div>
              <h2>Nueva producción</h2>
              <p>
                Elegí la preparación, asigná un responsable y definí para cuándo
                debe estar lista.
              </p>
            </div>
            {onPlanningClose && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Cerrar planificación"
                disabled={locked}
                onClick={onPlanningClose}
              >
                <X size={19} />
              </Button>
            )}
          </header>
          {planningPicker}
          {recipe && (
            <ConfirmOrder
              key={recipe.versionId}
              recipe={recipe}
              locked={locked || !preparationReady}
              preparationReady={preparationReady}
              submit={(url, data) => {
                assigning.current = true;
                void operation.submit(url, data);
              }}
              assignees={assignees}
              timeZone={timeZone}
            />
          )}
        </section>
      )}
      <section
        className={styles.ordersPanel}
        aria-label={
          fixedScope === "history"
            ? "Órdenes finalizadas"
            : "Órdenes de producción"
        }
      >
        <header className={styles.ordersHeading}>
          <div>
            <h2>
              {fixedScope === "history"
                ? "Órdenes finalizadas"
                : canManage
                  ? "Producción pendiente"
                  : "Mis tareas de producción"}
            </h2>
            <p>
              {fixedScope === "history"
                ? "Consultá lo realizado, sus diferencias y el historial de cada orden."
                : canManage
                  ? "Quién prepara, cuánto y para cuándo. Los insumos se reservan al iniciar."
                  : "Revisá tus indicaciones y marcá comenzar o terminar. Avisale al encargado si hubo diferencias."}
            </p>
          </div>
          <ClipboardList size={22} className="shrink-0 text-blue" />
        </header>
        {success && (
          <OperationAlert title="Producción actualizada" message={success} />
        )}
        {(error || operation.error || feedError) && (
          <OperationAlert
            eventKey={error ? errorAttempt : operation.errorAttempt}
            tone="error"
            title="No se pudo actualizar la producción"
            message={error || operation.error || feedError}
          />
        )}
        {operation.uncertain && (
          <Button onClick={operation.retry}>Reintentar el mismo envío</Button>
        )}
        <div className={styles.filters}>
          {canManage && !fixedScope && (
            <label>
              Ver órdenes
              <select
                value={scope}
                disabled={locked}
                onChange={(e) => {
                  setScope(e.target.value as "active" | "history");
                  setOffset(0);
                }}
              >
                <option value="active">Pendientes y en curso</option>
                <option value="history">Historial</option>
              </select>
            </label>
          )}
          {canManage && (
            <label>
              <input
                type="checkbox"
                checked={mine}
                disabled={locked}
                onChange={(e) => {
                  setMine(e.target.checked);
                  setOffsets({ active: 0, history: 0 });
                }}
              />{" "}
              Solo mis tareas
            </label>
          )}
          <Button
            variant="outline"
            disabled={operation.locked || externallyLocked || fetching}
            onClick={() => {
              setVersion((v) => v + 1);
            }}
          >
            <RefreshCw size={15} />
            {fetching ? "Actualizando…" : "Actualizar"}
          </Button>
        </div>
        <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 text-xs text-muted sm:px-7">
          <span>
            {feedError
              ? "Actualización interrumpida · No se enviarán cambios"
              : !feedFresh && !fetching
                ? "Actualizá las órdenes antes de continuar"
                : scope === "active"
                  ? "Se actualiza automáticamente cada 10 segundos"
                  : "Se actualiza automáticamente cada 30 segundos"}
          </span>
          {canManage && reviews.length > 0 && (
            <Button
              type="button"
              variant="outline"
              className="ml-auto border-amber-300 bg-amber-50 text-amber-950"
              onClick={revealReview}
            >
              Revisar {reviews.length}{" "}
              {reviews.length === 1 ? "diferencia" : "diferencias"}
            </Button>
          )}
        </div>
        <div>
          {feedLoading && (
            <p role="status" className="text-sm text-muted">
              Cargando órdenes…
            </p>
          )}
          {renderedRows.map((row) => {
            const latest = visibleRows.find((value) => value.id === row.id);
            const missing = missingOrders.includes(row.id);
            const changed =
              missing || (!!latest && latest.revision > row.revision);
            const difference = (latest ?? row).difference;
            return (
              <div
                key={row.id}
                className={styles.orderSlot}
                hidden={!visibleIds.has(row.id)}
              >
                <article
                  key={`${row.id}:${row.revision}`}
                  className={styles.order}
                  aria-label={row.name}
                  tabIndex={-1}
                  data-review-pending={
                    !!difference && row.state === "confirmed"
                  }
                  onInputCapture={() => markEdited(row.id)}
                  onChangeCapture={() => markEdited(row.id)}
                >
                  <header className={styles.orderHeader}>
                    <div>
                      <h3 className="font-semibold">
                        {row.name}
                        <span className={styles.orderQty}>
                          {quantity(row.plannedQuantity, row.baseUnit)}
                        </span>
                      </h3>
                      <p className="text-sm text-muted">
                        {row.assignee ?? "Sin responsable asignado"} ·{" "}
                        {row.location}
                      </p>
                    </div>
                    <span
                      className={styles.status}
                      data-status={
                        difference && row.state === "confirmed"
                          ? "review"
                          : row.state
                      }
                    >
                      {difference && row.state === "confirmed"
                        ? "Revisión pendiente"
                        : {
                            planned: "Planificada",
                            confirmed: "En curso",
                            completed: "Finalizada",
                            cancelled: "Anulada",
                          }[row.state]}
                    </span>
                  </header>
                  {row.scheduledFor && (
                    <p className={styles.schedule}>
                      <Clock3 size={14} />
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
                  {changed && (
                    <div
                      role="status"
                      className="my-4 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
                    >
                      <p className="font-semibold">
                        La orden cambió mientras la editabas. Conservamos tu
                        borrador.
                      </p>
                      <p>
                        {missing
                          ? "Ya no está en esta lista. Puede haber finalizado, cambiar de responsable o de estado. Consultá las órdenes y el historial."
                          : "Revisá los datos nuevos antes de continuar. Al abrirlos se descartan solo los cambios de este formulario."}
                      </p>
                      <Button
                        type="button"
                        variant="outline"
                        disabled={operation.locked || !feedFresh}
                        onClick={() => applyLatest(row.id)}
                      >
                        Revisar cambios y descartar este borrador
                      </Button>
                    </div>
                  )}
                  {difference && row.state === "confirmed" && (
                    <div
                      role="status"
                      className="my-4 space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
                    >
                      <p className="font-semibold">
                        Diferencia informada · Revisión del encargado pendiente
                      </p>
                      <p>
                        Obtenido:{" "}
                        {quantity(difference.actualQuantity, row.baseUnit)} ·
                        Previsto: {quantity(row.plannedQuantity, row.baseUnit)}
                      </p>
                      <p className="whitespace-pre-wrap">{difference.reason}</p>
                    </div>
                  )}
                  <fieldset disabled={locked || changed} className="min-w-0">
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
                        <p>
                          Tiempo estimado: {row.preparation.estimatedMinutes}{" "}
                          min
                        </p>
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
                        disabled={locked}
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
                    {canManage &&
                      ["planned", "confirmed"].includes(row.state) && (
                        <EditPlanning
                          order={row}
                          assignees={assignees}
                          timeZone={timeZone}
                          locked={locked}
                          submit={operation.submit}
                          onEdited={() => markEdited(row.id)}
                        />
                      )}
                    {row.state === "confirmed" &&
                    !canManage &&
                    !row.difference ? (
                      <div className="space-y-2">
                        <Button
                          disabled={locked}
                          onClick={() =>
                            operation.submit(
                              `/api/production/orders/${row.id}`,
                              {
                                requestId: crypto.randomUUID(),
                                completion: { expectedRevision: row.revision },
                              },
                            )
                          }
                        >
                          Terminar según lo previsto
                        </Button>
                        <p className="text-xs text-muted">
                          Se registrarán{" "}
                          {quantity(row.plannedQuantity, row.baseUnit)} según lo
                          previsto. Las diferencias las registra el encargado.
                        </p>
                        <ProductionDifferenceForm
                          plannedQuantity={row.plannedQuantity}
                          baseUnit={row.baseUnit}
                          revision={row.revision}
                          locked={locked}
                          onReport={(report) =>
                            operation.submit(
                              `/api/production/orders/${row.id}`,
                              {
                                requestId: crypto.randomUUID(),
                                report,
                              },
                            )
                          }
                        />
                      </div>
                    ) : row.state === "confirmed" && canManage ? (
                      <FinishOrder
                        key={`${row.id}:${row.revision}`}
                        order={row}
                        locked={locked}
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
                          locked={locked}
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
                                    {money(event.previousResult.totalCost)} ·
                                    costo revisado:{" "}
                                    {money(event.totalCost ?? null)}
                                  </p>
                                  {event.previousResult.consumption.map((c) => {
                                    const item = row.components.find(
                                      (p) => p.itemId === c.itemId,
                                    );
                                    return (
                                      <p key={c.itemId}>
                                        Consumo anterior de {item?.name}:{" "}
                                        {quantity(
                                          c.quantity,
                                          item?.baseUnit ?? "unit",
                                        )}
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
                                  {quantity(event.actualQuantity, row.baseUnit)}{" "}
                                  · previsto:{" "}
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
                                    {quantity(
                                      c.quantity,
                                      item?.baseUnit ?? "unit",
                                    )}
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
                              {quantity(
                                lot.quantity.replace("-", ""),
                                lot.baseUnit,
                              )}{" "}
                              · lote {lot.lotCode ?? lot.lotId.slice(0, 8)}
                              {lot.expiresOn ? ` · vence ${lot.expiresOn}` : ""}
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                  </fieldset>
                </article>
              </div>
            );
          })}
        </div>
        {!feedLoading && !feedError && (offset > 0 || hasMore) && (
          <div className={styles.pagination}>
            <span>
              Página {Math.floor(offset / 100) + 1} · Hasta 100 órdenes por
              página
            </span>
            <div>
              <Button
                variant="outline"
                disabled={offset === 0 || locked}
                onClick={() => {
                  setOffset((n) => Math.max(0, n - 100));
                }}
              >
                Página anterior
              </Button>
              <Button
                variant="outline"
                disabled={!hasMore || locked}
                onClick={() => {
                  setOffset((n) => n + 100);
                }}
              >
                Página siguiente
              </Button>
            </div>
          </div>
        )}
        {!fetching &&
          !error &&
          !feedError &&
          feedFresh &&
          visibleRows.length === 0 && (
            <div className={styles.empty}>
              <ClipboardList />
              <h3>
                {fixedScope === "history"
                  ? "Todavía no hay órdenes finalizadas"
                  : mine
                    ? "No tenés tareas pendientes"
                    : "No hay producciones pendientes"}
              </h3>
              <p>
                {fixedScope === "history"
                  ? "Las órdenes terminadas y anuladas quedan acá para consultar sus resultados."
                  : canManage
                    ? "Usá Nueva producción para asignar una preparación al equipo."
                    : "Las preparaciones que te asigne el encargado aparecerán acá."}
              </p>
            </div>
          )}
      </section>
    </div>
  );
}

function ConfirmOrder({
  recipe,
  locked,
  preparationReady,
  submit,
  assignees,
  timeZone,
}: {
  recipe: RecipeDetail;
  locked: boolean;
  preparationReady: boolean;
  submit: (url: string, payload: Record<string, unknown>) => void;
  assignees: { id: string; name: string }[];
  timeZone: string;
}) {
  const formId = useId();
  const [assignedTo, setAssignedTo] = useState("");
  const [scheduledFor, setScheduledFor] = useState("");
  const [notes, setNotes] = useState("");
  const [location, setLocation] = useState(""),
    [planned, setPlanned] = useState(inputDecimal(recipe.yieldQuantity)),
    [choices, setChoices] = useState<Record<string, string>>(() =>
      Object.fromEntries(
        recipe.lines.flatMap((line) => {
          const options = line.options.filter((option) => !option.archived);
          return !line.optional && options.length === 1
            ? [[line.id, options[0].id]]
            : [];
        }),
      ),
    ),
    [error, setError, errorAttempt] = useErrorFeedback();
  function save(e: FormEvent) {
    e.preventDefault();
    if (locked) return;
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
    <form className={styles.planningForm} onSubmit={save}>
      <fieldset disabled={locked}>
        <div className={styles.formGrid}>
          <AssigneeField
            value={assignedTo}
            onChange={setAssignedTo}
            options={assignees}
            disabled={locked}
          />
          <label>
            <FieldCaption required>Debe estar listo para</FieldCaption>
            <Input
              required
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
            />
            <span className={styles.helper}>Hora local de la sucursal</span>
          </label>
          <LocationSelect
            value={location}
            onChange={setLocation}
            disabled={locked}
            label="Lugar de preparación"
          />
          <Field
            label="Cantidad prevista"
            required
            value={planned}
            onChange={setPlanned}
            unit={recipe.baseUnit}
          />
        </div>
        <div className={styles.ingredients}>
          <div className={styles.ingredientsTitle}>
            <span>Ingredientes de la receta</span>
            <span className="text-xs font-normal text-muted">
              {recipe.lines.length} insumos
            </span>
          </div>
          {recipe.lines.map((line, i) => {
            const options = line.options.filter((option) => !option.archived);
            const fixed = !line.optional && options.length === 1;
            return (
              <div key={line.id} className={styles.ingredient}>
                {fixed ? (
                  <>
                    <span>
                      <PackageCheck size={17} />
                      {options[0].name}
                    </span>
                    <small>Incluido</small>
                  </>
                ) : (
                  <div className={styles.ingredientChoice}>
                    <label htmlFor={formId + line.id} className="mb-2 block">
                      <FieldCaption
                        required={!line.optional}
                        optional={line.optional}
                      >
                        Ingrediente {i + 1}
                      </FieldCaption>
                    </label>
                    <SearchCombobox
                      id={formId + line.id}
                      label={`Ingrediente ${i + 1}`}
                      value={choices[line.id] ?? ""}
                      selectedLabel={
                        options.find((option) => option.id === choices[line.id])
                          ?.name ?? ""
                      }
                      options={options}
                      required={!line.optional}
                      disabled={locked}
                      onChange={(value) =>
                        setChoices((rows) => ({ ...rows, [line.id]: value }))
                      }
                      onSearch={() => {}}
                      placeholder={
                        line.optional
                          ? "No utilizar o elegir una alternativa…"
                          : "Elegí una alternativa…"
                      }
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <label className={styles.notes}>
          <FieldCaption optional>Indicaciones para el responsable</FieldCaption>
          <textarea
            className="form-control"
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Por ejemplo: dejar enfriar antes de guardar."
          />
        </label>
        <div className={styles.formFooter}>
          <p>
            Asignar crea la tarea. El stock se reserva cuando se inicia la
            preparación.
          </p>
          <Button type="submit" disabled={locked}>
            <ClipboardList size={17} />
            {!preparationReady
              ? "Receta pendiente"
              : locked
                ? "Asignando…"
                : "Asignar producción"}
          </Button>
        </div>
      </fieldset>
      {error && (
        <OperationAlert
          eventKey={errorAttempt}
          tone="error"
          title="No pudimos completar la operación"
          message={error}
        />
      )}
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
    [lost, setLost] = useState(order.difference?.actualQuantity === "0.000000");
  const [actual, setActual] = useState(
      inputDecimal(order.difference?.actualQuantity ?? order.plannedQuantity),
    ),
    [amounts, setAmounts] = useState<Record<string, string>>({}),
    [expiry, setExpiry] = useState(""),
    [lotCode, setLotCode] = useState(""),
    [reason, setReason] = useState(order.difference?.reason ?? ""),
    [error, setError, errorAttempt] = useErrorFeedback();
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
            quantity: decimal(amounts[c.itemId] ?? inputDecimal(c.reserved), 6),
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
            <FieldCaption required>
              Consumido: {c.name} ({c.baseUnit})
            </FieldCaption>
            <Input
              inputMode="decimal"
              required
              value={amounts[c.itemId] ?? inputDecimal(c.reserved)}
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
          <FieldCaption required={!lost}>
            Producción obtenida ({order.baseUnit})
          </FieldCaption>
          <Input
            required={!lost}
            inputMode="decimal"
            disabled={lost}
            value={actual}
            onChange={(e) => setActual(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <FieldCaption optional>Vencimiento</FieldCaption>
          <Input
            type="date"
            value={expiry}
            onChange={(e) => setExpiry(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <FieldCaption optional>Código de lote</FieldCaption>
          <Input
            maxLength={120}
            value={lotCode}
            onChange={(e) => setLotCode(e.target.value)}
          />
        </label>
        <label className="text-sm">
          <FieldCaption required>
            Notas de finalización y diferencias
          </FieldCaption>
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
      {error && (
        <OperationAlert
          eventKey={errorAttempt}
          tone="error"
          title="No pudimos completar la operación"
          message={error}
        />
      )}
    </form>
  );
}

function EditPlanning({
  order,
  assignees,
  timeZone,
  locked,
  submit,
  onEdited,
}: {
  order: Order;
  assignees: { id: string; name: string }[];
  timeZone: string;
  locked: boolean;
  submit: (url: string, payload: Record<string, unknown>) => void;
  onEdited: () => void;
}) {
  const [assignedTo, setAssignedTo] = useState(order.assignedTo ?? "");
  const [scheduledFor, setScheduledFor] = useState(
    order.scheduledFor ? localSchedule(order.scheduledFor, timeZone) : "",
  );
  const [planned, setPlanned] = useState(inputDecimal(order.plannedQuantity));
  const [notes, setNotes] = useState(order.notes ?? "");
  const [reason, setReason] = useState("");
  const [error, setError, errorAttempt] = useErrorFeedback();
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
          <AssigneeField
            value={assignedTo}
            onChange={(value) => {
              onEdited();
              setAssignedTo(value);
            }}
            options={assignees}
            disabled={locked}
          />
          <label>
            <FieldCaption required>Debe estar listo para</FieldCaption>
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
            <FieldCaption required={order.state === "planned"}>
              Cantidad prevista ({order.baseUnit})
            </FieldCaption>
            <Input
              required={order.state === "planned"}
              disabled={order.state !== "planned"}
              inputMode="decimal"
              value={planned}
              onChange={(e) => setPlanned(e.target.value)}
            />
          </label>
          <label>
            <FieldCaption optional>Indicaciones</FieldCaption>
            <textarea
              className="w-full rounded border p-3"
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <label className="md:col-span-2">
            <FieldCaption required>Motivo del cambio o anulación</FieldCaption>
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
        {error && (
          <OperationAlert
            eventKey={errorAttempt}
            tone="error"
            title="No pudimos completar la operación"
            message={error}
          />
        )}
      </form>
    </details>
  );
}
