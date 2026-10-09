"use client";
import { decimal, integer } from "@/modules/inventory/decimal";
import { consumptionQuantity } from "@/modules/recipes/waste";

import { paths } from "@/lib/navigation";
import { ProductionOrdersPanel } from "./orders-panel";
import { LocationSelect } from "@/components/branches/location-select";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import {
  ChefHat,
  CircleCheck,
  AlertTriangle,
  PackageCheck,
  Search,
  History,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import type { RecipeDetail, RecipeList } from "@/modules/recipes/types";
import type {
  BatchDetail,
  BatchSummary,
  ProductionInput,
  ProductionOperation,
  ProductionPreview,
} from "@/modules/production/types";

export function ProductionManager({
  actorId,
  timeZone,
  initialRecipe = "",
}: {
  actorId: string;
  timeZone: string;
  initialRecipe?: string;
}) {
  const [list, setList] = useState<RecipeList>({ rows: [], total: 0 }),
    [search, setSearch] = useState(""),
    [offset, setOffset] = useState(0);
  const [selectedId, setSelectedId] = useState(initialRecipe),
    [recipe, setRecipe] = useState<RecipeDetail | null>(null),
    [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true),
    [recipeLoading, setRecipeLoading] = useState(!!initialRecipe),
    [error, setError] = useState("");
  const [saved, setSaved] = useState<BatchDetail | null>(null),
    [history, setHistory] = useState<{ rows: BatchSummary[]; total: number }>({
      rows: [],
      total: 0,
    }),
    [historyOffset, setHistoryOffset] = useState(0);
  const [historyError, setHistoryError] = useState(""),
    [batch, setBatch] = useState<BatchDetail | null>(null),
    [batchLoading, setBatchLoading] = useState(false);
  const onSaved = useCallback((result: unknown) => {
    setSaved(result as BatchDetail);
    setRecipe(null);
    setSelectedId("");
    setHistoryOffset(0);
    setRefresh((n) => n + 1);
  }, []);
  const operation = useOperation<ProductionOperation>(
    actorId,
    "production",
    onSaved,
  );
  useEffect(() => {
    let live = true;
    const timer = setTimeout(
      () => {
        setLoading(true);
        getJson<RecipeList>(
          `/api/recipes?kind=preparation&q=${encodeURIComponent(search)}&offset=${offset}`,
        )
          .then((data) => {
            if (live) {
              setList(data);
              setError("");
            }
          })
          .catch((e) => {
            if (live) setError(e.message);
          })
          .finally(() => {
            if (live) setLoading(false);
          });
      },
      search ? 200 : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [search, offset, refresh]);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      setRecipe(null);
      if (!selectedId) {
        setRecipeLoading(false);
        return;
      }
      setRecipeLoading(true);
      getJson<RecipeDetail>(`/api/recipes/${selectedId}`)
        .then((data) => {
          if (live) {
            if (data.kind !== "preparation" || data.archived)
              throw new Error("Seleccioná una preparación activa.");
            setRecipe(data);
            setError("");
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        })
        .finally(() => {
          if (live) setRecipeLoading(false);
        });
    }, 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [selectedId, refresh]);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      getJson<{ rows: BatchSummary[]; total: number }>(
        `/api/production?offset=${historyOffset}`,
      )
        .then((data) => {
          if (live) {
            setHistory(data);
            setHistoryError("");
          }
        })
        .catch((e) => {
          if (live) setHistoryError(e.message);
        });
    }, 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [refresh, historyOffset]);
  async function showBatch(id: string) {
    setBatchLoading(true);
    setBatch(null);
    try {
      setBatch(await getJson<BatchDetail>(`/api/production/${id}`));
    } catch (e) {
      setHistoryError(
        e instanceof Error ? e.message : "No pudimos cargar el lote.",
      );
    } finally {
      setBatchLoading(false);
    }
  }
  return (
    <div>
      <div className="page-heading">
        <div>
          <h1 className="page-title">Registro de producción</h1>
          <p className="page-description">
            Registrá artículos consumidos y rendimiento real de cada lote.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={paths["recipes"]}>
            Ver recetas
            <ArrowRight />
          </Link>
        </Button>
      </div>
      {(error || operation.error) && (
        <div
          role="alert"
          className="mb-5 rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-800"
        >
          <p>{error || operation.error}</p>
          {operation.uncertain ? (
            <Button
              className="mt-3"
              variant="outline"
              disabled={operation.busy}
              onClick={operation.retry}
            >
              Reintentar mismo envío
            </Button>
          ) : error ? (
            <Button
              className="mt-3"
              variant="outline"
              onClick={() => setRefresh((n) => n + 1)}
            >
              Reintentar carga
            </Button>
          ) : null}
        </div>
      )}
      <ProductionOrdersPanel actorId={actorId} recipe={recipe} />
      {saved ? (
        <section className="surface-panel mb-6 p-6">
          <div className="mb-4 flex items-center gap-3">
            <CircleCheck className="text-emerald-600" />
            <h2 className="text-xl font-bold" role="status">
              Producción registrada
            </h2>
          </div>
          <p className="text-sm text-muted">
            Se descontaron los artículos y se ingresaron{" "}
            {quantity(saved.actualOutput, saved.baseUnit)} de {saved.outputName}
            .
          </p>
          <div className="my-4 grid gap-x-6 sm:grid-cols-3">
            <dl>
              <SummaryLine label="Costo total" value={money(saved.totalCost)} />
            </dl>
            <dl>
              <SummaryLine
                label="Lote"
                value={saved.lotCode ?? saved.id.slice(0, 8)}
              />
            </dl>
            <dl>
              <SummaryLine
                label="Receta"
                value={`Versión ${saved.recipeRevision}`}
              />
            </dl>
          </div>
          <div className="flex flex-wrap gap-3">
            <Button
              onClick={() => {
                setSaved(null);
                setSelectedId(saved.recipeId);
              }}
            >
              Registrar otro lote
            </Button>
            <Button variant="outline" onClick={() => setBatch(saved)}>
              Ver detalle del lote
            </Button>
            <Button variant="outline" asChild>
              <Link href={paths["inventory"]}>Ver inventario</Link>
            </Button>
          </div>
        </section>
      ) : (
        <>
          <section
            className="surface-panel mb-5 p-5"
            aria-label="Elegir preparación"
          >
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-lg font-bold">¿Qué preparaste?</h2>
              {(list.total > 6 || search) && (
                <div className="relative w-full sm:w-64">
                  <Search
                    size={16}
                    className="absolute left-3 top-3.5 text-muted"
                  />
                  <Input
                    type="search"
                    className="pl-9"
                    aria-label="Buscar preparación"
                    placeholder="Buscar preparación…"
                    value={search}
                    disabled={operation.locked}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setOffset(0);
                    }}
                  />
                </div>
              )}
            </div>
            {loading ? (
              <p className="text-sm text-muted" role="status">
                Cargando preparaciones…
              </p>
            ) : !list.rows.length ? (
              <div className="py-5 text-sm text-muted">
                <p>
                  {search
                    ? "No encontramos esa preparación."
                    : "Todavía no hay recetas de preparaciones."}
                </p>
                <Link
                  className="mt-2 inline-block font-semibold text-blue-700 underline"
                  href={paths["recipes"]}
                >
                  Crear una receta base
                </Link>
              </div>
            ) : (
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {list.rows.map((row) => (
                  <button
                    key={row.id}
                    type="button"
                    disabled={operation.locked || row.archived}
                    aria-pressed={selectedId === row.id}
                    aria-label={`Seleccionar ${row.name}`}
                    className={`flex min-h-20 items-center gap-3 rounded-xl border p-4 text-left text-sm transition-colors disabled:opacity-50 ${selectedId === row.id ? "border-blue-500 bg-blue-50 ring-1 ring-blue-100" : "border-line hover:bg-surface"}`}
                    onClick={() => {
                      if (row.id === selectedId) {
                        if (recipe) return;
                        setRefresh((n) => n + 1);
                      }
                      setRecipe(null);
                      setRecipeLoading(true);
                      setSelectedId(row.id);
                      setError("");
                      operation.clearError();
                    }}
                  >
                    <ChefHat className="shrink-0 text-orange-600" size={24} />
                    <span className="min-w-0 flex-1 break-words font-semibold">
                      {row.name}
                      <span className="mt-1 block text-xs font-normal text-muted">
                        {row.archived
                          ? "Archivado"
                          : `${quantity(row.yieldQuantity, row.baseUnit)} por receta`}
                      </span>
                    </span>
                    <span
                      className={`flex size-5 shrink-0 items-center justify-center rounded-full border ${selectedId === row.id ? "border-blue-500" : "border-slate-300"}`}
                    >
                      {selectedId === row.id && (
                        <span className="size-3 rounded-full bg-blue-500" />
                      )}
                    </span>
                  </button>
                ))}
              </div>
            )}
            {list.total > 100 && (
              <div className="mt-4 flex justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!offset}
                  onClick={() => setOffset((n) => n - 100)}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={offset + 100 >= list.total}
                  onClick={() => setOffset((n) => n + 100)}
                >
                  Siguiente
                </Button>
              </div>
            )}
          </section>
          {recipeLoading ? (
            <p className="surface-panel p-8 text-sm text-muted" role="status">
              Cargando receta…
            </p>
          ) : recipe ? (
            <ProductionForm
              timeZone={timeZone}
              key={`${recipe.versionId}:${refresh}`}
              recipe={recipe}
              locked={operation.locked}
              operationStatus={operation.status}
              onConfirm={(data) => operation.submit("/api/production", data)}
              onReload={() => setRefresh((n) => n + 1)}
            />
          ) : !loading && list.rows.length > 0 ? (
            <Notice>
              Elegí una preparación para ingresar sus consumos y el rendimiento
              del lote.
            </Notice>
          ) : null}
        </>
      )}
      <section
        className="surface-panel mt-7 overflow-hidden"
        aria-label="Historial de producción"
      >
        <div className="flex items-center gap-3 border-b border-line p-5">
          <History size={19} className="text-blue-600" />
          <h2 className="text-lg font-bold">Últimas producciones</h2>
          <span className="ml-auto text-xs text-muted">
            {history.total} lotes
          </span>
        </div>
        {historyError && (
          <p role="alert" className="p-4 text-sm text-red-700">
            {historyError}{" "}
            <button
              className="underline"
              onClick={() => setRefresh((n) => n + 1)}
            >
              Reintentar
            </button>
          </p>
        )}
        {!history.rows.length ? (
          <p className="p-6 text-sm text-muted">
            Los lotes registrados aparecerán acá, con sus consumos, costos y
            responsable.
          </p>
        ) : (
          <ul className="divide-y divide-line">
            {history.rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  disabled={batchLoading}
                  className="flex w-full flex-wrap items-center gap-3 p-5 text-left hover:bg-surface"
                  onClick={() => void showBatch(row.id)}
                  aria-label={`Ver lote ${row.lotCode ?? row.id.slice(0, 8)}`}
                >
                  <PackageCheck size={23} className="text-blue-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block break-words text-sm font-semibold">
                      {row.outputName}
                    </span>
                    <span className="mt-1 block text-xs text-muted">
                      {date(row.producedOn)} · {row.actorName} ·{" "}
                      {row.lotCode ?? row.id.slice(0, 8)}
                    </span>
                  </span>
                  <span className="text-right text-sm font-semibold tabular-nums">
                    {quantity(row.actualOutput, row.baseUnit)}
                    <span className="mt-1 block text-xs font-normal text-muted">
                      {money(row.totalCost)}
                    </span>
                  </span>
                  <ArrowRight size={16} className="text-muted" />
                </button>
              </li>
            ))}
          </ul>
        )}
        {history.total > 50 && (
          <div className="flex justify-end gap-2 border-t border-line p-4">
            <Button
              variant="outline"
              disabled={!historyOffset}
              onClick={() => setHistoryOffset((n) => n - 50)}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              disabled={historyOffset + 50 >= history.total}
              onClick={() => setHistoryOffset((n) => n + 50)}
            >
              Siguiente
            </Button>
          </div>
        )}
      </section>
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
    [error, setError] = useState("");
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
    <form
      onSubmit={submit}
      className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(330px,0.8fr)]"
    >
      <section className="surface-panel min-w-0 p-5 sm:p-6">
        <fieldset disabled={disabled}>
          <h2 className="mb-4 text-xl font-bold">Datos del lote</h2>
          <LocationSelect
            value={locationId}
            onChange={(value) => {
              setLocationId(value);
              invalidate();
            }}
            disabled={disabled}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Recetas base"
              value={multiplier}
              onChange={multiply}
              required
            />
            <Field
              label="Fecha de producción"
              value={date(today(timeZone))}
              hint="Registro del día · hora de la sucursal"
            />
          </div>
          <div className="my-5 border-t border-line" />
          <div className="mb-4">
            <h2 className="text-xl font-bold">Artículos utilizados</h2>
            <p className="mt-1 text-sm text-muted">
              Ajustá las cantidades al consumo real de este lote.
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
                  className="grid items-center gap-3 border-b border-line py-4 last:border-0 sm:grid-cols-[minmax(0,1fr)_155px]"
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
                        Disponible:{" "}
                        {quantity(availability.usable, availability.baseUnit)}
                        {availability.shortfall !== "0.000000" &&
                          ` · Faltan ${quantity(availability.shortfall, availability.baseUnit)}`}
                      </p>
                    )}
                    {(line.optional || line.options.length > 1) && (
                      <select
                        className="form-control mt-2"
                        aria-label={`Alternativa de producción ${i + 1}`}
                        value={selection.optionId ?? ""}
                        onChange={(e) => {
                          invalidate();
                          const chosen = line.options.find(
                            (o) => o.id === e.target.value,
                          );
                          let qty = "0";
                          if (chosen) {
                            try {
                              qty = inputDecimal(
                                consumptionQuantity(
                                  chosen.quantity,
                                  chosen.wastePercent,
                                  integer(decimal(multiplier, 6, true, true)!),
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
                      >
                        {line.optional && <option value="">No utilizar</option>}
                        {line.options.map((o) => (
                          <option value={o.id} key={o.id}>
                            {o.name}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                  <Field
                    label={`Consumo real ${i + 1}`}
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
          <div className="mb-5 mt-4 border-t border-line" />
          <h2 className="mb-4 text-xl font-bold">Rendimiento</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Esperado"
              value={expected ? inputDecimal(expected) : ""}
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
            Notas del lote
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
      <aside className="min-w-0 space-y-4">
        <section className="surface-panel p-5 sm:p-6">
          <h2 className="mb-2 text-xl font-bold">Resumen del lote</h2>
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
                  : "Revisar lote"
              }
            />
            <SummaryLine
              label="Costo total de artículos"
              value={preview ? money(preview.totalCost) : "Por calcular"}
              strong
            />
            <SummaryLine
              label={`Costo por ${unitLabel(recipe.baseUnit)}`}
              value={preview ? money(preview.unitCost, 6) : "Por calcular"}
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
          <p
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"
          >
            {error}
          </p>
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
        <section className="surface-panel space-y-3 p-5">
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
            Se descontarán los artículos y se sumará el preparado al stock.
            Revisá los datos antes de guardar.
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
