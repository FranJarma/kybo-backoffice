"use client";
import { useEffect, useRef, useState } from "react";
import { Tabs } from "radix-ui";
import { Plus, RefreshCw, Trash2, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OperationAlert } from "@/components/ui/operation-alert";
import { useErrorFeedback } from "@/components/ui/use-error-feedback";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { money, quantity } from "@/lib/number-format";
import {
  expenseCategories,
  type ExpenseEntry,
} from "@/modules/overheads/types";
import type { getExpenses } from "@/modules/overheads/service";
import {
  expenseCommandSchema,
  expenseValidationFeedback,
} from "@/modules/overheads/validation";
import { FieldCaption } from "@/components/ui/field-caption";
import { BreakEvenPanel } from "./break-even-panel";
type Snapshot = Awaited<ReturnType<typeof getExpenses>>;
type DraftEntry = Omit<ExpenseEntry, "budget" | "actual" | "category"> & {
  category: ExpenseEntry["category"] | "";
  budget: string;
  actual: string;
};
const editable = (entries: ExpenseEntry[]): DraftEntry[] =>
  entries.map((e) => ({
    ...e,
    budget: e.budget?.replace(".", ",") ?? "",
    actual: e.actual?.replace(".", ",") ?? "",
  }));
export function ExpensesManager({ initialMonth }: { initialMonth: string }) {
  const [view, setView] = useState("expenses");
  const [analysisVisited, setAnalysisVisited] = useState(false);
  const [month, setMonth] = useState(initialMonth),
    [generation, setGeneration] = useState(0);
  const [snapshot, setSnapshot] = useState<Snapshot>();
  const [entries, setEntries] = useState<DraftEntry[]>([]),
    [units, setUnits] = useState("");
  const [iibbRate, setIibbRate] = useState("");
  const [dirty, setDirty] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true);
  const [error, setError, errorAttempt] = useErrorFeedback();
  const [notice, setNotice] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  const root = useRef<HTMLDivElement>(null);
  const [closing, setClosing] = useState(false),
    [revising, setRevising] = useState(false),
    [confirmed, setConfirmed] = useState(false),
    [reason, setReason] = useState("");
  const retry = useRef<{ payload: string; requestId: string }>(null);
  useEffect(() => {
    let live = true;
    async function load() {
      setLoading(true);
      setError("");
      setFields({});
      try {
        const response = await fetch(`/api/finance/expenses?month=${month}`);
        const data = await response.json();
        if (!response.ok)
          throw Error(data.error ?? "No pudimos consultar los gastos.");
        if (live) {
          setSnapshot(data);
          setEntries(editable(data.period?.entries ?? []));
          setUnits(data.period?.expectedUnits?.toString() ?? "");
          setIibbRate(data.period?.iibbRate?.replace(".", ",") ?? "");
          setDirty(false);
          setRevising(false);
          setReason("");
          setConfirmed(false);
        }
      } catch (e) {
        if (live) {
          setError((e as Error).message);
        }
      } finally {
        if (live) setLoading(false);
      }
    }
    void load();
    return () => {
      live = false;
    };
  }, [month, generation, setError]);
  const current = snapshot?.month === month ? snapshot : undefined;
  const closed = current?.period?.status === "closed";
  const disabled = loading || busy || (closed && !revising);
  function clearField(field: string) {
    setFields((old) => {
      const next = { ...old };
      delete next[field];
      return next;
    });
  }
  function focusField(errors: Record<string, string>) {
    const first = Object.keys(errors)[0];
    Array.from(
      root.current?.querySelectorAll<HTMLElement>("[data-expense-field]") ?? [],
    )
      .find((control) => control.dataset.expenseField === first)
      ?.focus();
  }
  function invalidField(name: string) {
    return {
      "data-expense-field": name,
      "aria-invalid": !!fields[name] || undefined,
    };
  }
  function update(index: number, change: Partial<DraftEntry>) {
    setEntries((old) =>
      old.map((e, i) => (i === index ? { ...e, ...change } : e)),
    );
    setDirty(true);
    Object.keys(change).forEach((key) => clearField(`entries.${index}.${key}`));
  }
  function discard() {
    return (
      !dirty || window.confirm("Hay cambios sin guardar. ¿Querés descartarlos?")
    );
  }
  async function submit(action: "save" | "close" | "revise") {
    setError("");
    setNotice("");
    setFields({});
    const command = {
      action,
      month,
      revision: current?.period?.revision ?? 0,
      ...(action !== "close"
        ? {
            entries,
            expectedUnits: units.trim() ? Number(units) : null,
            iibbRate,
          }
        : {}),
      ...(action !== "save"
        ? { confirmed, ...(action === "revise" ? { reason } : {}) }
        : {}),
    };
    const validation = expenseCommandSchema.safeParse(command);
    if (!validation.success) {
      const feedback = expenseValidationFeedback(validation.error);
      setError(feedback.error);
      setFields(feedback.fields);
      focusField(feedback.fields);
      return;
    }
    setBusy(true);
    try {
      const payload = JSON.stringify(command);
      if (retry.current?.payload !== payload)
        retry.current = { payload, requestId: crypto.randomUUID() };
      const response = await fetch("/api/finance/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: retry.current.requestId, command }),
      });
      const result = await response.json();
      if (!response.ok) {
        if (result.fields) {
          setFields(result.fields);
          focusField(result.fields);
        }
        throw Error(result.error ?? "No pudimos guardar el mes.");
      }
      setNotice(
        action === "save"
          ? "Mes guardado."
          : action === "close"
            ? "Cierre mensual registrado."
            : "Revisión del cierre registrada.",
      );
      retry.current = null;
      setClosing(false);
      setDirty(false);
      setRevising(false);
      setGeneration((n) => n + 1);
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "No pudimos preparar o enviar el guardado. Tus datos se conservan; probá de nuevo."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
    }
  }
  const summary = current?.summary;
  const automaticEntries = current?.automaticEntries ?? [];
  return (
    <div ref={root} className="mx-auto max-w-7xl space-y-7 pb-10">
      <OperationAlert title="Gastos del negocio" message={notice} />
      <OperationAlert
        key={errorAttempt}
        title="No pudimos completar la operación"
        message={closing ? "" : error}
        tone="error"
      />
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-muted">
            Finanzas
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-brand">
            Gastos del negocio
          </h1>
          <p className="mt-2 text-sm text-muted">
            Planificá los gastos y conocé cuánto necesitás vender para
            cubrirlos.
          </p>
        </div>
        <label className="grid gap-2 text-sm font-medium">
          <FieldCaption required>Mes de gastos</FieldCaption>
          <input
            {...invalidField("month")}
            required
            type="month"
            className="form-control min-w-44"
            value={month}
            disabled={busy || loading}
            min="2000-01"
            max="2099-12"
            onChange={(e) => {
              if (e.target.value && discard()) {
                setMonth(e.target.value);
                setNotice("");
              }
            }}
          />
        </label>
      </div>
      <Tabs.Root
        value={view}
        onValueChange={(value) => {
          setView(value);
          if (value === "break-even") setAnalysisVisited(true);
        }}
      >
        <Tabs.List
          aria-label="Análisis financiero"
          className="mb-6 flex gap-5 border-b border-line"
        >
          <Tabs.Trigger
            value="expenses"
            className="min-h-12 border-b-2 border-transparent px-1 text-sm text-muted outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-blue data-[state=active]:border-blue data-[state=active]:text-blue"
          >
            Gastos del mes
          </Tabs.Trigger>
          <Tabs.Trigger
            value="break-even"
            className="min-h-12 border-b-2 border-transparent px-1 text-sm text-muted outline-none hover:text-brand focus-visible:ring-2 focus-visible:ring-blue data-[state=active]:border-blue data-[state=active]:text-blue"
          >
            Punto de equilibrio
          </Tabs.Trigger>
        </Tabs.List>
        {analysisVisited && (
          <Tabs.Content
            value="break-even"
            forceMount
            className="space-y-4 data-[state=inactive]:hidden"
          >
            {dirty && (
              <p role="status" className="text-sm text-muted">
                El análisis usa el presupuesto guardado. Hay cambios sin guardar
                en Gastos del mes.
              </p>
            )}
            <BreakEvenPanel month={month} revision={generation} />
          </Tabs.Content>
        )}
        <Tabs.Content
          value="expenses"
          forceMount
          className="space-y-7 data-[state=inactive]:hidden"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-y border-line py-3 text-sm">
            <span>
              {closed ? (
                <span className="inline-flex items-center gap-2 font-medium text-emerald-700">
                  <LockKeyhole size={16} /> Mes cerrado · revisión{" "}
                  {current?.closures[0]?.sequence}
                </span>
              ) : (
                "Presupuesto y gastos reales"
              )}
              {dirty && (
                <span className="ml-3 text-amber-800">Cambios sin guardar</span>
              )}
            </span>
            <Button
              variant="ghost"
              disabled={loading || busy}
              onClick={() => {
                if (discard()) setGeneration((n) => n + 1);
              }}
            >
              <RefreshCw size={16} /> Actualizar
            </Button>
          </div>
          {loading ? (
            <p role="status" className="py-12 text-center text-muted">
              Consultando el mes…
            </p>
          ) : (
            current && (
              <>
                <section
                  aria-label="Resumen del mes"
                  className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4"
                >
                  {[
                    {
                      label: "Presupuesto mensual",
                      value: money(
                        summary!.budgetPending || !entries.length
                          ? null
                          : summary!.budgetTotal,
                      ),
                      detail: summary!.budgetPending
                        ? `${summary!.budgetPending} importes pendientes`
                        : "Gastos previstos",
                    },
                    {
                      label: "Real registrado",
                      value: money(
                        summary!.actualPending ||
                          (!entries.length && !automaticEntries.length)
                          ? null
                          : summary!.actualTotal,
                      ),
                      detail: summary!.actualPending
                        ? `${summary!.actualPending} importes pendientes`
                        : "Gastos cargados",
                    },
                    {
                      label: "Estimado por unidad",
                      value: money(summary!.budgetRate),
                      detail: "Para evaluar precios",
                      test: "budget-rate",
                    },
                    {
                      label: "Unidades vendidas",
                      value: quantity(String(current.actualUnits)),
                      detail: "Ventas cerradas del mes",
                    },
                  ].map((item) => (
                    <div key={item.label} className="bg-white p-5">
                      <p className="text-sm text-muted">{item.label}</p>
                      <p
                        data-testid={item.test}
                        className="mt-3 text-2xl font-semibold text-brand tabular-nums"
                      >
                        {item.value}
                      </p>
                      <p className="mt-2 text-xs text-muted">{item.detail}</p>
                    </div>
                  ))}
                </section>
                {dirty && (
                  <p className="text-xs text-muted">
                    El resumen muestra los últimos datos guardados. Guardá el
                    mes para actualizarlo.
                  </p>
                )}
                {closed &&
                  current.closures[0]?.actualUnits !== current.actualUnits && (
                    <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
                      Las ventas del mes cambiaron desde el último cierre. El
                      historial conserva las unidades originales; usá Revisar
                      cierre para registrar la actualización con su motivo.
                    </p>
                  )}
                <section className="rounded-xl border border-line bg-white p-5 sm:p-7">
                  <div className="mb-7 border-b border-line pb-7">
                    <h2 className="mb-4 text-lg font-semibold text-brand">
                      Impuestos estimados
                    </h2>
                    <label className="grid max-w-xs gap-2 text-sm font-medium">
                      <FieldCaption optional>
                        Alícuota estimada de IIBB (%)
                      </FieldCaption>
                      <input
                        {...invalidField("iibbRate")}
                        className="form-control"
                        inputMode="decimal"
                        disabled={disabled}
                        placeholder="Pendiente de confirmar"
                        value={iibbRate}
                        onChange={(e) => {
                          setIibbRate(e.target.value);
                          clearField("iibbRate");
                          setDirty(true);
                        }}
                      />
                    </label>
                    <p className="mt-3 text-xs leading-relaxed text-muted">
                      Confirmá la alícuota efectiva y el régimen con tu
                      contador. Se aplica a la venta sin IVA para estimar
                      rentabilidad; no se suma al precio ni constituye una
                      declaración fiscal. Vacío es pendiente; 0 confirma que no
                      corresponde estimar este impuesto. No vuelvas a cargar IVA
                      ni este IIBB en el detalle de gastos.
                    </p>
                  </div>
                  <div className="grid items-start gap-6 md:grid-cols-[minmax(200px,320px)_1fr]">
                    <label className="grid gap-2 text-sm font-medium">
                      <FieldCaption optional>
                        Unidades previstas del mes
                      </FieldCaption>
                      <input
                        {...invalidField("expectedUnits")}
                        className="form-control"
                        inputMode="numeric"
                        type="number"
                        min="1"
                        max="1000000000"
                        step="1"
                        disabled={disabled}
                        value={units}
                        onChange={(e) => {
                          setUnits(e.target.value);
                          clearField("expectedUnits");
                          setDirty(true);
                        }}
                        placeholder="Ej.: 4000"
                      />
                    </label>
                    <p className="text-sm leading-relaxed text-muted md:pt-7">
                      Incluí todos los productos vendidos, también gaseosas. Un
                      waffle con gaseosa cuenta como 2 unidades; sus
                      preparaciones intermedias no se suman. El presupuesto se
                      reparte entre este volumen previsto, sin variar por las
                      ventas del día.
                    </p>
                  </div>
                  <div className="mt-8 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
                    <h2 className="text-lg font-semibold text-brand">
                      Detalle de gastos
                    </h2>
                    <Button
                      variant="outline"
                      disabled={disabled}
                      onClick={() => {
                        setEntries((old) => [
                          ...old,
                          {
                            category: "",
                            concept: "",
                            budget: "",
                            actual: "",
                            notes: "",
                          },
                        ]);
                        setDirty(true);
                      }}
                    >
                      <Plus size={16} /> Agregar gasto
                    </Button>
                  </div>
                  <p className="mt-4 text-xs leading-relaxed text-muted">
                    Los campos con * son obligatorios. Podés dejar presupuesto y
                    real pendientes. Completá aquí los importes que todavía no
                    registraste en Caja; los gastos del día se incorporan abajo
                    automáticamente y no hace falta volver a cargarlos.
                  </p>
                  {!entries.length && (
                    <p className="py-12 text-center text-sm text-muted">
                      Sin gastos cargados
                    </p>
                  )}
                  <fieldset
                    disabled={disabled}
                    className="divide-y divide-line"
                  >
                    {entries.map((entry, i) => (
                      <div key={i} className="space-y-5 py-6">
                        <div className="grid items-end gap-4 sm:grid-cols-2 lg:grid-cols-[1.5fr_1fr_1fr_auto]">
                          <label className="grid gap-2 text-sm">
                            <FieldCaption required>Tipo de gasto</FieldCaption>
                            <select
                              {...invalidField(`entries.${i}.category`)}
                              required
                              aria-label={`Tipo de gasto ${i + 1}`}
                              className="form-control"
                              value={entry.category}
                              onChange={(e) =>
                                update(i, {
                                  category: e.target
                                    .value as ExpenseEntry["category"],
                                  concept: "",
                                })
                              }
                            >
                              <option value="" disabled>
                                Elegí un tipo de gasto
                              </option>
                              {Object.entries(expenseCategories).map(
                                ([key, name]) => (
                                  <option key={key} value={key}>
                                    {name}
                                  </option>
                                ),
                              )}
                            </select>
                          </label>
                          <label className="grid gap-2 text-sm">
                            <FieldCaption optional>Presupuesto</FieldCaption>
                            <input
                              {...invalidField(`entries.${i}.budget`)}
                              aria-label={`Presupuesto ${i + 1}`}
                              className="form-control tabular-nums"
                              inputMode="decimal"
                              value={entry.budget}
                              onChange={(e) =>
                                update(i, { budget: e.target.value })
                              }
                              placeholder="Pendiente"
                            />
                          </label>
                          <label className="grid gap-2 text-sm">
                            <FieldCaption required>Real</FieldCaption>
                            <input
                              {...invalidField(`entries.${i}.actual`)}
                              required={revising}
                              aria-label={`Real ${i + 1}`}
                              className="form-control tabular-nums"
                              inputMode="decimal"
                              value={entry.actual}
                              onChange={(e) =>
                                update(i, { actual: e.target.value })
                              }
                              placeholder="Pendiente"
                            />
                            {!revising && (
                              <small className="text-xs leading-relaxed text-muted">
                                Obligatorio para cerrar el mes; podés guardarlo
                                pendiente.
                              </small>
                            )}
                          </label>
                          <Button
                            variant="ghost"
                            aria-label={`Quitar gasto ${i + 1}`}
                            onClick={() => {
                              setEntries((old) =>
                                old.filter((_, n) => n !== i),
                              );
                              setDirty(true);
                            }}
                          >
                            <Trash2 size={17} />
                          </Button>
                        </div>
                        {entry.category === "other" ? (
                          <label className="grid gap-2 text-sm">
                            <FieldCaption required>Descripción</FieldCaption>
                            <input
                              {...invalidField(`entries.${i}.concept`)}
                              required
                              aria-label={`Descripción ${i + 1}`}
                              className="form-control"
                              maxLength={120}
                              value={entry.concept}
                              onChange={(e) =>
                                update(i, { concept: e.target.value })
                              }
                              placeholder="Ej.: Seguro del local"
                            />
                          </label>
                        ) : entry.category &&
                          entry.concept &&
                          entry.concept !==
                            expenseCategories[entry.category] ? (
                          <p className="text-xs text-muted">
                            Detalle guardado: {entry.concept}
                          </p>
                        ) : null}
                        <label className="grid gap-2 text-sm text-muted">
                          <FieldCaption optional>Observaciones</FieldCaption>
                          <input
                            aria-label={`Observaciones ${i + 1}`}
                            className="form-control"
                            maxLength={1000}
                            value={entry.notes}
                            onChange={(e) =>
                              update(i, { notes: e.target.value })
                            }
                          />
                        </label>
                      </div>
                    ))}
                  </fieldset>
                  {automaticEntries.length > 0 && (
                    <section
                      aria-label="Gastos registrados en Caja"
                      className="my-6 rounded-lg border border-line bg-surface p-4"
                    >
                      <h3 className="text-sm font-semibold text-brand">
                        Gastos registrados en Caja
                      </h3>
                      <p className="mt-2 text-xs leading-relaxed text-muted">
                        Ya están incluidos en el real del mes. Se consultan aquí
                        sin volver a cargarlos.
                        {closed &&
                          " Este cierre conserva una copia; una revisión toma los registros disponibles en ese momento."}
                      </p>
                      <div className="mt-4 overflow-x-auto">
                        <table className="w-full min-w-96 text-left text-sm">
                          <thead>
                            <tr className="border-b border-line">
                              <th className="py-2">Jornada</th>
                              <th>Gasto</th>
                              <th>Origen del dinero</th>
                              <th className="text-right">Real</th>
                            </tr>
                          </thead>
                          <tbody>
                            {automaticEntries.map((entry) => (
                              <tr
                                key={entry.sourceId}
                                className="border-b border-line last:border-0"
                              >
                                <td className="py-3 pr-3 whitespace-nowrap">
                                  {entry.businessDate
                                    .split("-")
                                    .reverse()
                                    .join("/")}
                                </td>
                                <td className="py-3 pr-3">
                                  <span className="block">{entry.concept}</span>
                                  <span className="text-xs text-muted">
                                    {expenseCategories[entry.category]}
                                  </span>
                                </td>
                                <td className="py-3 pr-3">
                                  {entry.fundingSource === "cash"
                                    ? "Efectivo de Caja"
                                    : "Fondos externos"}
                                </td>
                                <td className="py-3 text-right tabular-nums">
                                  {money(entry.actual)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>
                  )}
                  <p className="border-t border-line pt-4 text-xs leading-relaxed text-muted">
                    Importes en pesos, con coma decimal. Vacío significa
                    pendiente; 0 confirma que no hubo gasto. No repitas
                    ingredientes, envíos ni descartables ya incluidos en la
                    receta, ni comisiones de cobro. El IVA de ventas no se
                    agrega automáticamente.
                  </p>
                  {revising && (
                    <div className="mt-6 space-y-4 rounded-lg bg-amber-50 p-5">
                      <label className="grid gap-2 text-sm font-medium">
                        <FieldCaption required>
                          Motivo de la revisión
                        </FieldCaption>
                        <textarea
                          {...invalidField("reason")}
                          required
                          className="form-control"
                          value={reason}
                          maxLength={1000}
                          onChange={(e) => {
                            setReason(e.target.value);
                            clearField("reason");
                          }}
                        />
                      </label>
                      <label className="flex items-center gap-3 text-sm">
                        <input
                          type="checkbox"
                          checked={confirmed}
                          onChange={(e) => setConfirmed(e.target.checked)}
                        />
                        Confirmo que registré todos los gastos reales
                      </label>
                      <p className="text-xs leading-relaxed text-muted">
                        Se crea otro cierre con las ventas disponibles ahora. El
                        anterior permanece en el historial.
                      </p>
                    </div>
                  )}
                  <div className="mt-6 flex flex-wrap justify-end gap-3">
                    {closed && !revising ? (
                      <Button
                        variant="outline"
                        onClick={() => {
                          setRevising(true);
                          setConfirmed(false);
                        }}
                      >
                        Revisar cierre
                      </Button>
                    ) : revising ? (
                      <>
                        <Button
                          variant="ghost"
                          disabled={busy}
                          onClick={() => {
                            if (discard()) setGeneration((n) => n + 1);
                          }}
                        >
                          Cancelar revisión
                        </Button>
                        <Button
                          disabled={busy || !confirmed || !reason.trim()}
                          onClick={() => void submit("revise")}
                        >
                          {busy ? "Guardando…" : "Guardar revisión del cierre"}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          variant="outline"
                          disabled={
                            busy ||
                            dirty ||
                            !current.period ||
                            (!entries.length && !automaticEntries.length) ||
                            summary!.actualPending > 0
                          }
                          onClick={() => {
                            setClosing(true);
                            setConfirmed(false);
                          }}
                        >
                          Cerrar mes
                        </Button>
                        <Button
                          disabled={
                            busy ||
                            (!dirty &&
                              (!!current.period || !automaticEntries.length))
                          }
                          onClick={() => void submit("save")}
                        >
                          {busy ? "Guardando…" : "Guardar mes"}
                        </Button>
                      </>
                    )}
                  </div>
                </section>
                {current.closures.length > 0 && (
                  <section className="rounded-xl border border-line bg-white p-5 sm:p-7">
                    <h2 className="text-lg font-semibold text-brand">
                      Historial de cierres
                    </h2>
                    <p className="mt-2 text-sm text-muted">
                      Cada revisión conserva sus gastos y unidades. Las ventas o
                      anulaciones posteriores no cambian este historial.
                    </p>
                    <div className="mt-5 divide-y divide-line">
                      {current.closures.map((close) => (
                        <details
                          key={close.id}
                          className="py-4"
                          open={close.sequence === current.closures[0].sequence}
                        >
                          <summary className="cursor-pointer text-sm font-medium">
                            Cierre {close.sequence} ·{" "}
                            {new Date(close.closedAt).toLocaleString("es-AR", {
                              timeZone: current.timeZone,
                            })}{" "}
                            · Real por unidad: {money(close.summary.actualRate)}
                          </summary>
                          <div className="mt-4 space-y-3 text-sm">
                            <p>{close.reason}</p>
                            <p className="text-muted">
                              Real: {money(close.summary.actualTotal)} /{" "}
                              {quantity(String(close.actualUnits))} unidades.
                              Estimado: {money(close.summary.budgetRate)} por
                              unidad. IIBB estimado:{" "}
                              {close.iibbRate === null
                                ? "Pendiente"
                                : `${quantity(close.iibbRate)}%`}
                              . Responsable:{" "}
                              {close.actorName ?? "Usuario registrado"}.
                            </p>
                            <div className="overflow-x-auto">
                              <table className="w-full min-w-96 text-left text-sm">
                                <thead>
                                  <tr className="border-b border-line">
                                    <th className="py-2">Gasto</th>
                                    <th>Presupuesto</th>
                                    <th>Real</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {close.entries.map((e, i) => (
                                    <tr key={i}>
                                      <td className="py-2">
                                        {e.concept}
                                        {"source" in e &&
                                          e.source === "cash" && (
                                            <span className="ml-2 text-xs text-muted">
                                              Caja
                                            </span>
                                          )}
                                      </td>
                                      <td>{money(e.budget)}</td>
                                      <td>{money(e.actual)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </details>
                      ))}
                    </div>
                  </section>
                )}
              </>
            )
          )}
          <Dialog
            open={closing}
            onOpenChange={(open) => {
              if (!busy) setClosing(open);
            }}
          >
            <DialogContent>
              <DialogTitle>Cerrar el mes</DialogTitle>
              <DialogDescription>
                Guardamos una copia de los gastos y de las ventas cerradas
                disponibles ahora. Si no hubo ventas, el gasto por unidad queda
                pendiente. Las correcciones se registran como una nueva
                revisión.
              </DialogDescription>
              <label className="my-3 flex items-start gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Confirmo que registré todos los gastos reales
              </label>
              <OperationAlert
                key={errorAttempt}
                title="No pudimos cerrar el mes"
                message={closing ? error : ""}
                tone="error"
              />
              <Button
                disabled={busy || !confirmed}
                onClick={() => void submit("close")}
              >
                {busy ? "Cerrando…" : "Confirmar cierre"}
              </Button>
            </DialogContent>
          </Dialog>
        </Tabs.Content>
      </Tabs.Root>
    </div>
  );
}
