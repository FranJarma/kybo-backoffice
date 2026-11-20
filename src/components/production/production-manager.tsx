"use client";
import { useErrorFeedback } from "@/components/ui/use-error-feedback";
import { FieldCaption } from "@/components/ui/field-caption";
import { OperationAlert } from "@/components/ui/operation-alert";
import { decimal, integer } from "@/modules/inventory/decimal";
import { consumptionQuantity } from "@/modules/recipes/waste";
import { paths } from "@/lib/navigation";
import { ProductionOrdersPanel } from "./orders-panel";
import { PreparationPicker } from "./preparation-picker";
import { SearchCombobox } from "@/components/ui/search-combobox";
import { LocationSelect } from "@/components/branches/location-select";
import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { Tabs } from "@/components/ui/tabs";
import Link from "next/link";
import {
  CircleCheck,
  AlertTriangle,
  PackageCheck,
  History,
  ArrowRight,
  RefreshCw,
  ClipboardList,
  Plus,
  BookOpen,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  date,
  getJson,
  money,
  quantity,
  today,
  useOperation,
} from "@/components/inventory/shared";
import {
  Field,
  inputDecimal,
  Notice,
  scaledQuantity,
  SummaryLine,
  unitLabel,
} from "@/components/recipes/shared";
import type { RecipeDetail } from "@/modules/recipes/types";
import type {
  BatchDetail,
  BatchSummary,
  ProductionInput,
  ProductionOperation,
  ProductionPreview,
} from "@/modules/production/types";
import styles from "./production.module.css";

export function ProductionManager({
  actorId,
  timeZone,
  initialRecipe = "",
}: {
  actorId: string;
  timeZone: string;
  initialRecipe?: string;
}) {
  const [mode, setMode] = useState("plan");
  const [creating, setCreating] = useState(!!initialRecipe);
  const [planRecipe, setPlanRecipe] = useState<RecipeDetail | null>(null);
  const [recordRecipe, setRecordRecipe] = useState<RecipeDetail | null>(null);
  const [planRecipeReady, setPlanRecipeReady] = useState(false);
  const [recordRecipeReady, setRecordRecipeReady] = useState(false);
  const [orderBusy, setOrderBusy] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [historyRefresh, setHistoryRefresh] = useState(0);
  const [saved, setSaved] = useState<BatchDetail | null>(null);
  const [history, setHistory] = useState<{
    rows: BatchSummary[];
    total: number;
  }>({ rows: [], total: 0 });
  const [historyOffset, setHistoryOffset] = useState(0);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historyError, setHistoryError, historyErrorAttempt] =
    useErrorFeedback();
  const [batch, setBatch] = useState<BatchDetail | null>(null);
  const [batchLoading, setBatchLoading] = useState(false);
  const onSaved = useCallback((result: unknown) => {
    setSaved(result as BatchDetail);
    setHistoryOffset(0);
    setRefresh((n) => n + 1);
    setHistoryRefresh((n) => n + 1);
  }, []);
  const operation = useOperation<ProductionOperation>(
    actorId,
    "production",
    onSaved,
  );
  const locked = operation.locked || orderBusy;
  useEffect(() => {
    if (mode !== "history") return;
    let live = true;
    getJson<{ rows: BatchSummary[]; total: number }>(
      `/api/production?offset=${historyOffset}`,
    )
      .then((data) => {
        if (live) {
          setHistory(data);
          setHistoryError("");
        }
      })
      .catch((error) => {
        if (live) setHistoryError(error.message);
      })
      .finally(() => {
        if (live) setHistoryLoading(false);
      });
    return () => {
      live = false;
    };
  }, [mode, historyRefresh, historyOffset, setHistoryError]);
  async function showBatch(id: string) {
    setBatchLoading(true);
    try {
      setBatch(await getJson<BatchDetail>(`/api/production/${id}`));
    } catch (error) {
      setHistoryError(
        error instanceof Error ? error.message : "No pudimos cargar el lote.",
      );
    } finally {
      setBatchLoading(false);
    }
  }
  return (
    <div className={styles.workspace}>
      <header className={styles.heading}>
        <div>
          <p className={styles.kicker}>Preparaciones e inventario</p>
          <h1>Registro de producción</h1>
          <p>
            Organizá las preparaciones y registrá lo que realmente se produce.
          </p>
        </div>
        <div className={styles.headingActions}>
          <Button variant="outline" asChild>
            <Link href={paths["recipes"]}>
              <BookOpen size={17} /> Ver recetas
            </Link>
          </Button>
          <Button
            disabled={locked}
            onClick={() => {
              setMode("plan");
              setCreating(true);
            }}
          >
            <Plus size={18} /> Nueva producción
          </Button>
        </div>
      </header>
      {operation.error && (
        <OperationAlert
          eventKey={operation.errorAttempt}
          tone="error"
          title="No pudimos completar la operación"
          message={operation.error}
        />
      )}
      {operation.uncertain && (
        <div
          role="status"
          className="mb-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"
        >
          <p>El resultado del envío está pendiente de confirmar.</p>
          <Button
            className="mt-3"
            variant="outline"
            disabled={operation.busy}
            onClick={operation.retry}
          >
            Reintentar mismo envío
          </Button>
        </div>
      )}
      <Tabs.Root
        value={mode}
        onValueChange={(value) => {
          if (!locked) setMode(value);
        }}
      >
        <Tabs.List className={styles.tabs} aria-label="Registro de producción">
          {[
            { id: "plan", label: "Órdenes", icon: ClipboardList },
            { id: "record", label: "Registrar lote", icon: PackageCheck },
            { id: "history", label: "Historial", icon: History },
          ].map(({ id, label, icon: Icon }) => (
            <Tabs.Trigger
              className={styles.tab}
              value={id}
              key={id}
              disabled={locked}
            >
              <Icon size={18} />
              {label}
            </Tabs.Trigger>
          ))}
        </Tabs.List>
        <Tabs.Content
          value={mode === "history" ? "history" : "plan"}
          forceMount
          className={styles.panel}
        >
          <ProductionOrdersPanel
            actorId={actorId}
            recipe={planRecipe}
            timeZone={timeZone}
            canManage
            planningOpen={creating}
            preparationReady={planRecipeReady}
            onPlanningClose={() => setCreating(false)}
            planningPicker={
              <PreparationPicker
                initialRecipe={planRecipe?.id ?? initialRecipe}
                onChange={setPlanRecipe}
                onReadyChange={setPlanRecipeReady}
                disabled={locked}
              />
            }
            onBusy={setOrderBusy}
            externallyLocked={operation.locked}
            fixedScope={mode === "history" ? "history" : "active"}
          />
          <div hidden={mode !== "history"}>
            {" "}
            <section
              className={styles.historySection}
              aria-label="Lotes registrados"
            >
              <header className={styles.ordersHeading}>
                <div>
                  <h2>Lotes registrados</h2>
                  <p>
                    Consumos, rendimiento y costos de las producciones ya
                    ingresadas al inventario.
                  </p>
                </div>
                <span className={styles.status}>{history.total} lotes</span>
              </header>
              {historyError && (
                <OperationAlert
                  eventKey={historyErrorAttempt}
                  tone="error"
                  title="No pudimos cargar las producciones"
                  message={historyError}
                />
              )}
              {historyError && (
                <Button
                  className="m-4"
                  variant="outline"
                  onClick={() => {
                    setHistoryLoading(true);
                    setHistoryRefresh((n) => n + 1);
                  }}
                >
                  Reintentar
                </Button>
              )}
              {historyLoading ? (
                <p role="status" className="p-6 text-sm text-muted">
                  Cargando lotes…
                </p>
              ) : !history.rows.length ? (
                <div className={styles.empty}>
                  <History />
                  <h3>Todavía no hay lotes registrados</h3>
                  <p>
                    Los lotes cargados desde Registrar lote aparecerán acá con
                    su rendimiento y sus consumos.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {history.rows.map((row) => (
                    <li key={row.id}>
                      <button
                        type="button"
                        disabled={batchLoading}
                        className={styles.historyRow}
                        onClick={() => void showBatch(row.id)}
                        aria-label={`Ver lote ${row.lotCode ?? row.id.slice(0, 8)}`}
                      >
                        <PackageCheck size={24} />
                        <span className="min-w-0 flex-1">
                          <span className={styles.historyTitle}>
                            {row.outputName}
                          </span>
                          <span className={styles.historyInfo}>
                            {date(row.producedOn)} · {row.actorName} ·{" "}
                            {row.lotCode ?? row.id.slice(0, 8)}
                          </span>
                        </span>
                        <span className={styles.historyAmount}>
                          {quantity(row.actualOutput, row.baseUnit)}
                          <span className={styles.historyInfo}>
                            {money(row.totalCost)}
                          </span>
                        </span>
                        <ArrowRight size={16} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {history.total > 50 && (
                <div className={styles.pagination}>
                  <span>
                    Lotes {historyOffset + 1}–
                    {Math.min(historyOffset + 50, history.total)} de{" "}
                    {history.total}
                  </span>
                  <div>
                    <Button
                      variant="outline"
                      disabled={!historyOffset || locked}
                      onClick={() => {
                        setHistoryLoading(true);
                        setHistoryOffset((n) => n - 50);
                      }}
                    >
                      Página anterior
                    </Button>
                    <Button
                      variant="outline"
                      disabled={historyOffset + 50 >= history.total || locked}
                      onClick={() => {
                        setHistoryLoading(true);
                        setHistoryOffset((n) => n + 50);
                      }}
                    >
                      Página siguiente
                    </Button>
                  </div>
                </div>
              )}
            </section>
          </div>
        </Tabs.Content>
        <Tabs.Content value="record" forceMount className={styles.panel}>
          <div className={styles.sectionHeading}>
            <div>
              <h2>Registrar un lote producido</h2>
              <p>
                Para preparaciones hechas sin una orden asignada. Si ya tiene
                una orden, finalizala desde Órdenes.
              </p>
            </div>
          </div>
          {saved ? (
            <section className="surface-panel p-6">
              <div className="mb-4 flex items-center gap-3">
                <CircleCheck className="text-emerald-600" />
                <h2 className="text-lg font-bold" role="status">
                  Producción registrada
                </h2>
              </div>
              <p className="text-sm text-muted">
                Se descontaron los insumos y se ingresaron{" "}
                {quantity(saved.actualOutput, saved.baseUnit)} de{" "}
                {saved.outputName}.
              </p>
              <div className="my-4">
                <SummaryLine
                  label="Costo total"
                  value={money(saved.totalCost)}
                />
                <SummaryLine
                  label="Lote"
                  value={saved.lotCode ?? saved.id.slice(0, 8)}
                />
              </div>
              <div className="flex flex-wrap gap-3">
                <Button
                  onClick={() => {
                    setSaved(null);
                    setRefresh((n) => n + 1);
                  }}
                >
                  Registrar otro lote
                </Button>
                <Button variant="outline" onClick={() => setBatch(saved)}>
                  Ver detalle del lote
                </Button>
              </div>
            </section>
          ) : (
            <>
              <section className={styles.recordPicker}>
                <PreparationPicker
                  initialRecipe={recordRecipe?.id}
                  refreshKey={refresh}
                  onChange={setRecordRecipe}
                  onReadyChange={setRecordRecipeReady}
                  disabled={locked}
                />
              </section>
              {recordRecipe ? (
                <ProductionForm
                  key={`${recordRecipe.versionId}:${refresh}`}
                  recipe={recordRecipe}
                  timeZone={timeZone}
                  locked={locked || !recordRecipeReady}
                  operationStatus={operation.status}
                  onConfirm={(data) =>
                    operation.submit("/api/production", data)
                  }
                  onReload={() => {
                    setRecordRecipe(null);
                    setRefresh((n) => n + 1);
                  }}
                />
              ) : (
                <div className={styles.empty}>
                  <PackageCheck />
                  <h3>Elegí qué preparaste</h3>
                  <p>
                    La receta completa los insumos previstos. Después podés
                    ajustar el consumo y la cantidad obtenida.
                  </p>
                </div>
              )}
            </>
          )}
        </Tabs.Content>
      </Tabs.Root>
      <Dialog
        open={!!batch}
        onOpenChange={(open) => {
          if (!open) setBatch(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Detalle de producción</DialogTitle>
            <DialogDescription>
              Consumos y costos registrados al crear este lote.
            </DialogDescription>
          </DialogHeader>
          {batch && <BatchView batch={batch} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProductionForm({
  recipe,
  timeZone,
  locked,
  operationStatus,
  onConfirm,
  onReload,
}: {
  recipe: RecipeDetail;
  timeZone: string;
  locked: boolean;
  operationStatus: number | null;
  onConfirm: (data: ProductionOperation) => void;
  onReload: () => void;
}) {
  const formId = useId();
  const [multiplier, setMultiplier] = useState("1"),
    [locationId, setLocationId] = useState(""),
    [actual, setActual] = useState(inputDecimal(recipe.yieldQuantity));
  const [selections, setSelections] = useState(() =>
    recipe.lines.map((line) => ({
      lineId: line.id,
      optionId: line.options[0].id as string | null,
      quantity: inputDecimal(
        consumptionQuantity(
          line.options[0].quantity,
          line.options[0].wastePercent,
        ),
      ),
    })),
  );
  const [expiresOn, setExpiry] = useState(""),
    [lotCode, setLot] = useState(""),
    [notes, setNotes] = useState("");
  const [review, setReview] = useState<{
      input: ProductionInput;
      preview: ProductionPreview;
    } | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError, errorAttempt] = useErrorFeedback();
  const [confirmationSent, setConfirmationSent] = useState(false);
  const disabled = locked || busy;
  const preview = review?.preview;
  let expected = "";
  try {
    expected = scaledQuantity(recipe.yieldQuantity, multiplier);
  } catch {
    /* Incomplete multiplier while typing. */
  }
  function invalidate() {
    setReview(null);
    setError("");
    setConfirmationSent(false);
  }
  function multiply(value: string) {
    invalidate();
    setMultiplier(value);
    try {
      setActual(inputDecimal(scaledQuantity(recipe.yieldQuantity, value)));
      setSelections((rows) =>
        rows.map((s) => {
          const option = recipe.lines
            .find((l) => l.id === s.lineId)!
            .options.find((o) => o.id === s.optionId);
          return {
            ...s,
            quantity: option
              ? inputDecimal(
                  consumptionQuantity(
                    option.quantity,
                    option.wastePercent,
                    integer(decimal(value, 6, true, true)!),
                  ),
                )
              : "0",
          };
        }),
      );
    } catch {
      /* Validation is shown when reviewing. */
    }
  }
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (disabled) return;
    setBusy(true);
    invalidate();
    const input: ProductionInput = {
      locationId,
      recipeId: recipe.id,
      revision: recipe.revision,
      multiplier,
      actualOutput: actual,
      producedOn: today(timeZone),
      expiresOn: expiresOn || null,
      lotCode,
      notes,
      selections,
    };
    try {
      const response = await fetch("/api/production/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setReview({ input, preview: result });
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No pudimos revisar el lote. Probá de nuevo.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className={styles.recordForm}>
      <section className={styles.recordMain}>
        <fieldset disabled={disabled}>
          <h2>Datos y rendimiento</h2>
          <p className={styles.recordMeta}>
            {recipe.name} · {date(today(timeZone))} · Hora de la sucursal
          </p>
          <div className={styles.formGrid}>
            <LocationSelect
              value={locationId}
              onChange={(value) => {
                setLocationId(value);
                invalidate();
              }}
              disabled={disabled}
              label="Lugar de preparación"
            />
            <Field
              label="Cantidad de tandas"
              value={multiplier}
              onChange={multiply}
              required
              hint={`Una tanda: ${quantity(recipe.yieldQuantity, recipe.baseUnit)}`}
            />
          </div>
          <div className={styles.yield}>
            <Field
              label="Esperado"
              value={expected ? quantity(expected) : ""}
              unit={recipe.baseUnit}
            />
            <Field
              label="Producción real"
              value={actual}
              onChange={(v) => {
                invalidate();
                setActual(v);
              }}
              unit={recipe.baseUnit}
              required
            />
          </div>
          {preview && (
            <div className="mt-4">
              <Notice>
                Diferencia:{" "}
                <strong>
                  {quantity(preview.yieldDifference, recipe.baseUnit)}
                </strong>
                . El costo se distribuye sobre lo que realmente produjiste.
              </Notice>
            </div>
          )}
          <div className="my-5 border-t border-line" />
          <div className="mb-4">
            <h2 className="text-xl font-bold">Insumos utilizados</h2>
            <p className="mt-1 text-sm text-muted">
              Cantidades según la receta. Ajustalas si usaste más o menos en
              este lote.
            </p>
          </div>
          <div>
            {recipe.lines.map((line, i) => {
              const selection = selections.find((s) => s.lineId === line.id)!;
              const option = line.options.find(
                (o) => o.id === selection.optionId,
              );
              const availability = preview?.items.find(
                (r) => r.itemId === option?.itemId,
              );
              return (
                <div
                  key={line.id}
                  className={styles.ingredientRow}
                  role="group"
                  aria-label={option?.name ?? `Ingrediente ${i + 1}`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-surface text-blue-600">
                        <PackageCheck size={20} />
                      </span>
                      <span className="break-words text-sm font-semibold">
                        {option?.name ?? "Sin ingrediente"}
                        {line.optional && (
                          <span className="ml-2 text-xs font-normal text-blue-700">
                            Opcional
                          </span>
                        )}
                      </span>
                    </div>
                    {availability && (
                      <p
                        className={`ml-12 mt-1 text-xs ${availability.shortfall !== "0.000000" ? "text-red-700" : "text-muted"}`}
                      >
                        {availability.stockTracked === false
                          ? "Sin control de inventario"
                          : `Disponible: ${quantity(availability.usable, availability.baseUnit)}`}
                        {availability.shortfall !== "0.000000" &&
                          ` · Faltan ${quantity(availability.shortfall, availability.baseUnit)}`}
                      </p>
                    )}
                    {(line.optional || line.options.length > 1) && (
                      <div className="mt-2 block text-xs font-medium">
                        <label htmlFor={formId + line.id}>
                          <FieldCaption
                            required={!line.optional}
                            optional={line.optional}
                          >
                            Alternativa de producción {i + 1}
                          </FieldCaption>
                        </label>
                        <SearchCombobox
                          id={formId + line.id}
                          label={`Alternativa de producción ${i + 1}`}
                          required={!line.optional}
                          disabled={disabled}
                          value={selection.optionId ?? ""}
                          selectedLabel={option?.name ?? ""}
                          options={line.options}
                          onSearch={() => {}}
                          placeholder={
                            line.optional
                              ? "No utilizar o elegir alternativa…"
                              : "Elegí una alternativa…"
                          }
                          onChange={(value) => {
                            invalidate();
                            const chosen = line.options.find(
                              (o) => o.id === value,
                            );
                            let qty = "0";
                            if (chosen) {
                              try {
                                qty = inputDecimal(
                                  consumptionQuantity(
                                    chosen.quantity,
                                    chosen.wastePercent,
                                    integer(
                                      decimal(multiplier, 6, true, true)!,
                                    ),
                                  ),
                                );
                              } catch {
                                qty = inputDecimal(chosen.quantity);
                              }
                            }
                            setSelections((rows) =>
                              rows.map((s) =>
                                s.lineId === line.id
                                  ? {
                                      ...s,
                                      optionId: chosen?.id ?? null,
                                      quantity: qty,
                                    }
                                  : s,
                              ),
                            );
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <Field
                    label="Consumo real"
                    value={selection.quantity}
                    unit={option?.baseUnit ?? "g"}
                    disabled={!option}
                    required
                    onChange={(value) => {
                      invalidate();
                      setSelections((rows) =>
                        rows.map((s) =>
                          s.lineId === line.id ? { ...s, quantity: value } : s,
                        ),
                      );
                    }}
                  />
                </div>
              );
            })}
          </div>
          <div className="mb-5 mt-6 border-t border-line" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Código de lote"
              value={lotCode}
              onChange={(v) => {
                invalidate();
                setLot(v);
              }}
              hint="Opcional. Se genera un identificador interno."
            />
            <Field
              label="Vencimiento"
              type="date"
              value={expiresOn}
              onChange={(v) => {
                invalidate();
                setExpiry(v);
              }}
              hint="Si lo dejás vacío, quedará sin fecha registrada."
            />
          </div>
          <label className="mt-4 block text-xs font-semibold">
            <FieldCaption optional>Notas del lote</FieldCaption>
            <textarea
              className="form-control mt-2 min-h-20"
              maxLength={2000}
              value={notes}
              onChange={(e) => {
                invalidate();
                setNotes(e.target.value);
              }}
              placeholder="Observaciones sobre la preparación…"
            />
          </label>
        </fieldset>
      </section>
      <aside className={styles.recordAside}>
        <section className={styles.recordSummary}>
          <p className={styles.kicker}>Antes de guardar</p>
          <h2 className="mt-2 mb-2">Resumen del lote</h2>
          <dl>
            <SummaryLine label="Preparación" value={recipe.name} />
            <SummaryLine
              label="Receta utilizada"
              value={`Versión ${recipe.revision}`}
            />
            <SummaryLine
              label="Salida esperada"
              value={expected ? quantity(expected, recipe.baseUnit) : "—"}
            />
            <SummaryLine
              label="Salida real"
              value={
                preview
                  ? quantity(preview.actualOutput, recipe.baseUnit)
                  : quantity(actual || "0", recipe.baseUnit)
              }
            />
            <SummaryLine
              label="Costo total de artículos"
              value={preview ? money(preview.totalCost) : "Por calcular"}
              strong
            />
            <SummaryLine
              label={`Costo por ${unitLabel(recipe.baseUnit)}`}
              value={preview ? money(preview.unitCost) : "Por calcular"}
            />
          </dl>
          {preview?.missingCosts.length ? (
            <p className="mt-2 text-xs leading-relaxed text-amber-800">
              Costo pendiente en el stock de: {preview.missingCosts.join(", ")}.
              El lote se puede registrar y conservará ese costo pendiente.
            </p>
          ) : (
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Se usa el costo promedio del stock consumido. La revisión
              selecciona los lotes que vencen primero.
            </p>
          )}
        </section>
        {preview && !preview.canConfirm && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-5 text-red-800"
          >
            <div className="flex items-center gap-2 font-bold">
              <AlertTriangle size={21} />
              <h3>Stock insuficiente</h3>
            </div>
            <ul className="mt-3 space-y-2 text-sm">
              {preview.items
                .filter((i) => i.shortfall !== "0.000000")
                .map((i) => (
                  <li key={i.itemId}>
                    {i.name}: faltan {quantity(i.shortfall, i.baseUnit)}.
                  </li>
                ))}
            </ul>
            <Link
              className="mt-4 inline-block text-sm font-bold underline"
              href={paths["inventory"]}
            >
              Revisar inventario
            </Link>
          </div>
        )}
        {error && (
          <OperationAlert
            eventKey={errorAttempt}
            tone="error"
            title="No pudimos completar la operación"
            message={error}
          />
        )}
        {confirmationSent && operationStatus === 409 && (
          <Notice>
            Los datos cambiaron. Revisá el lote nuevamente o{" "}
            <button
              type="button"
              className="font-semibold underline"
              onClick={onReload}
            >
              recargá la receta
            </button>
            .
          </Notice>
        )}
        <section className={styles.recordActions}>
          <Button
            className="w-full"
            type="submit"
            variant="outline"
            disabled={disabled}
          >
            <RefreshCw size={17} />
            {busy ? "Revisando…" : "Revisar lote"}
          </Button>
          <Button
            className="w-full"
            type="button"
            disabled={disabled || !preview?.canConfirm || confirmationSent}
            onClick={() => {
              if (review) {
                setConfirmationSent(true);
                onConfirm({
                  ...review.input,
                  requestId: crypto.randomUUID(),
                  previewToken: review.preview.token,
                });
              }
            }}
          >
            <PackageCheck />
            Guardar lote
          </Button>
          <p className="text-center text-xs leading-relaxed text-muted">
            Se descontarán los insumos y se sumará el preparado al stock. Revisá
            los datos antes de guardar.
          </p>
        </section>
        {recipe.notes && (
          <Notice>
            <strong>Preparación</strong>
            <p className="mt-2 whitespace-pre-wrap">{recipe.notes}</p>
          </Notice>
        )}
      </aside>
    </form>
  );
}

function BatchView({ batch }: { batch: BatchDetail }) {
  return (
    <div>
      <h3 className="text-lg font-bold">{batch.outputName}</h3>
      <p className="mt-1 text-xs text-muted">
        {date(batch.producedOn)} · {batch.actorName} · Versión{" "}
        {batch.recipeRevision}
      </p>
      <dl className="my-3">
        <SummaryLine
          label="Lote"
          value={batch.lotCode ?? batch.id.slice(0, 8)}
        />
        <SummaryLine
          label="Esperado"
          value={quantity(batch.expectedOutput, batch.baseUnit)}
        />
        <SummaryLine
          label="Producido"
          value={quantity(batch.actualOutput, batch.baseUnit)}
        />
        <SummaryLine label="Costo total" value={money(batch.totalCost)} />
        <SummaryLine
          label="Vencimiento"
          value={
            batch.expiresOn ? date(batch.expiresOn) : "Sin fecha registrada"
          }
        />
      </dl>
      <h4 className="mb-2 text-sm font-bold">Consumos por lote</h4>
      <ul className="divide-y divide-line rounded-xl border border-line px-4">
        {batch.allocations.map((row, i) => (
          <li
            key={`${row.lotId}:${i}`}
            className="flex justify-between gap-4 py-3 text-sm"
          >
            <span className="min-w-0 break-words">
              {row.itemName}
              <span className="mt-1 block text-xs text-muted">
                Lote {row.lotId.slice(0, 8)}
              </span>
            </span>
            <span className="shrink-0 text-right tabular-nums">
              {quantity(row.quantity, row.baseUnit)}
              <span className="mt-1 block text-xs text-muted">
                {money(row.totalCost)}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {batch.notes && (
        <p className="mt-4 whitespace-pre-wrap text-sm text-muted">
          {batch.notes}
        </p>
      )}
      <Button className="mt-4" variant="outline" asChild>
        <Link href={paths["inventory"]}>Ver inventario</Link>
      </Button>
    </div>
  );
}
