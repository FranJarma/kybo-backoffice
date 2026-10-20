"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ChevronDown, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldCaption } from "@/components/ui/field-caption";
import { OperationAlert } from "@/components/ui/operation-alert";
import { useErrorFeedback } from "@/components/ui/use-error-feedback";
import { money, quantity } from "@/lib/number-format";
import { calculateBreakEven } from "@/modules/overheads/break-even";
import { allocateOverhead } from "@/modules/overheads/calculation";
import type {
  BreakEvenScenario,
  BreakEvenSnapshot,
} from "@/modules/overheads/break-even-model";
import type { SaleChannel } from "@/modules/sales/types";

type Inputs = {
  scope: string;
  channel: SaleChannel;
  methodId: string;
  entries: { productId: string; quantity: string }[];
  expectedUnits: string;
  daysOpen: string;
  source: "historical" | "partial" | "custom";
};
type Loaded = {
  key: string;
  scope: string;
  snapshot?: BreakEvenSnapshot;
  failed: boolean;
};
type ProductResult = ReturnType<typeof calculateBreakEven>["products"][number];

const channels: { id: SaleChannel; name: string }[] = [
  { id: "counter", name: "Mostrador / local" },
  { id: "pedidosya", name: "PedidosYa" },
  { id: "ubereats", name: "Uber Eats" },
];

async function loadSnapshot(month: string): Promise<BreakEvenSnapshot> {
  const response = await fetch(
    `/api/finance/break-even?month=${encodeURIComponent(month)}`,
    { cache: "no-store" },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error ?? "No pudimos consultar el punto de equilibrio.",
    );
  return data;
}

function initialInputs(snapshot: BreakEvenSnapshot, scope: string): Inputs {
  const hasCompleteMix =
    snapshot.historicalMix.length > 0 && snapshot.historicalExcludedUnits === 0;
  return {
    scope,
    channel: "counter",
    methodId:
      snapshot.methods.find(
        (method) => method.name.trim().toLocaleLowerCase() === "efectivo",
      )?.id ??
      snapshot.methods[0]?.id ??
      "",
    entries: hasCompleteMix
      ? snapshot.historicalMix.map((entry) => ({
          ...entry,
          quantity: String(entry.quantity),
        }))
      : [],
    expectedUnits: snapshot.budget.expectedUnits?.toString() ?? "",
    daysOpen: "",
    source: hasCompleteMix ? "historical" : "custom",
  };
}

function wholeNumber(value: string, empty: number | null): number | null {
  if (!value.trim()) return empty;
  return /^\d+$/.test(value) ? Number(value) : Number.NaN;
}

function count(value: number | null) {
  return value === null ? "Pendiente" : quantity(String(value));
}

export function BreakEvenPanel({
  month,
  revision,
}: {
  month: string;
  revision: string | number;
}) {
  const id = useId();
  const [refresh, setRefresh] = useState(0);
  const responseScope = `${month}:${revision}`;
  const inputScope = month;
  const key = `${responseScope}:${refresh}`;
  const request = useRef<{
    key: string;
    promise: Promise<BreakEvenSnapshot>;
  }>(null);
  const [loaded, setLoaded] = useState<Loaded>();
  const [inputs, setInputs] = useState<Inputs>();
  const [error, setError, errorAttempt] = useErrorFeedback();

  useEffect(() => {
    let live = true;
    // Reuse the promise when Strict Mode replays this effect.
    if (request.current?.key !== key)
      request.current = { key, promise: loadSnapshot(month) };
    request.current.promise.then(
      (snapshot) => {
        if (!live) return;
        setLoaded({ key, scope: responseScope, snapshot, failed: false });
        setInputs((previous) =>
          previous?.scope === inputScope
            ? previous
            : initialInputs(snapshot, inputScope),
        );
        setError("");
      },
      (cause: unknown) => {
        if (!live) return;
        setLoaded((previous) => ({
          key,
          scope: responseScope,
          snapshot:
            previous?.scope === responseScope ? previous.snapshot : undefined,
          failed: true,
        }));
        setError(
          cause instanceof TypeError
            ? "No pudimos conectar. Los datos anteriores se conservan; probá de nuevo."
            : cause instanceof Error
              ? cause.message
              : "No pudimos consultar el punto de equilibrio. Probá de nuevo.",
        );
      },
    );
    return () => {
      live = false;
    };
  }, [key, month, responseScope, inputScope, setError]);

  const snapshot =
    loaded?.scope === responseScope ? loaded.snapshot : undefined;
  const currentInputs = inputs?.scope === inputScope ? inputs : undefined;
  const loading = loaded?.key !== key;
  const failed = loaded?.key === key && loaded.failed;
  const scenario = useMemo<BreakEvenScenario | null>(
    () =>
      currentInputs
        ? {
            channel: currentInputs.channel,
            methodId: currentInputs.methodId,
            entries: currentInputs.entries.map((entry) => ({
              productId: entry.productId,
              quantity: wholeNumber(entry.quantity, Number.NaN) ?? Number.NaN,
            })),
            expectedUnits: wholeNumber(currentInputs.expectedUnits, null),
            daysOpen: wholeNumber(currentInputs.daysOpen, null),
          }
        : null,
    [currentInputs],
  );
  const result = useMemo(
    () =>
      snapshot && scenario ? calculateBreakEven(snapshot, scenario) : undefined,
    [snapshot, scenario],
  );
  const productById = useMemo(
    () => new Map(snapshot?.products.map((product) => [product.id, product])),
    [snapshot],
  );
  const resultById = useMemo(
    () =>
      new Map(result?.products.map((product) => [product.productId, product])),
    [result],
  );
  const selectedProducts = new Set(
    currentInputs?.entries.map((entry) => entry.productId),
  );
  const method = snapshot?.methods.find(
    (item) => item.id === currentInputs?.methodId,
  );
  const expectedUnits = scenario?.expectedUnits ?? null;
  const requiredContribution =
    snapshot?.budget.total != null &&
    expectedUnits !== null &&
    Number.isSafeInteger(expectedUnits) &&
    expectedUnits > 0
      ? allocateOverhead(snapshot.budget.total, expectedUnits, 1)
      : null;

  function update(change: Partial<Inputs>) {
    setInputs((previous) =>
      previous?.scope === inputScope ? { ...previous, ...change } : previous,
    );
  }

  return (
    <section aria-label="Punto de equilibrio" className="space-y-6">
      <OperationAlert
        eventKey={errorAttempt}
        title="No pudimos consultar el punto de equilibrio"
        message={error}
        tone="error"
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="max-w-3xl">
          <h2 className="text-xl font-semibold tracking-tight text-brand">
            Punto de equilibrio
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Estimá cuánto vender para cubrir el presupuesto guardado de {month}.
            Usamos precios y costos actuales, impuestos, comisiones y la
            composición predeterminada de cada producto. Es una simulación; no
            representa el resultado contable de las ventas históricas.
          </p>
          {snapshot ? (
            <p className="mt-2 text-xs text-muted">
              {snapshot.branchName} · Datos guardados · Las hipótesis se
              mantienen sólo en este panel.
            </p>
          ) : null}
        </div>
        <Button
          type="button"
          variant="ghost"
          disabled={loading}
          onClick={() => setRefresh((previous) => previous + 1)}
        >
          <RefreshCw
            size={16}
            aria-hidden="true"
            className={loading ? "motion-safe:animate-spin" : undefined}
          />
          {loading ? "Consultando…" : failed ? "Reintentar" : "Actualizar"}
        </Button>
      </div>

      {loading ? (
        <p role="status" className="text-sm text-muted">
          {snapshot
            ? "Actualizando precios, costos y presupuesto…"
            : "Consultando precios, costos y presupuesto…"}
        </p>
      ) : failed ? (
        <p role="status" className="text-sm text-muted">
          {snapshot
            ? "Mostrando la última consulta; actualizá para comprobar los datos."
            : "La consulta no está disponible. Reintentá para cargar los datos."}
        </p>
      ) : null}

      {snapshot && currentInputs && result ? (
        <>
          <div
            aria-label="Resumen de la simulación"
            className="grid gap-px overflow-hidden rounded-xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4"
          >
            <Metric
              label="Gastos del mes a cubrir"
              value={money(snapshot.budget.total)}
              note={
                snapshot.budget.pending
                  ? `${count(snapshot.budget.pending)} gastos pendientes de presupuesto`
                  : "Presupuesto guardado, sin usar gastos reales incompletos"
              }
            />
            <Metric
              label="Aporte por unidad final"
              value={money(result.averageContribution)}
              note="Después de costos, impuestos y comisión; antes de gastos fijos"
            />
            <Metric
              label="Unidades para cubrir gastos"
              value={
                result.breakEvenUnits !== null
                  ? count(result.breakEvenUnits)
                  : result.status === "missing_mix"
                    ? "Definí la mezcla"
                    : result.status === "non_positive"
                      ? "Sin equilibrio"
                      : "Pendiente"
              }
              note={
                result.breakEvenPerDay !== null
                  ? `${count(result.breakEvenPerDay)} unidades finales por día de apertura`
                  : "Unidades finales, manteniendo la mezcla elegida"
              }
            />
            <Metric
              label="Resultado mensual estimado"
              value={money(result.projectedProfit)}
              negative={
                result.projectedProfit !== null &&
                Number(result.projectedProfit) < 0
              }
              note={
                scenario?.expectedUnits != null &&
                Number.isSafeInteger(scenario.expectedUnits)
                  ? `Con ${count(scenario.expectedUnits)} unidades finales; después de gastos fijos`
                  : "Ingresá un volumen previsto para estimar el resultado"
              }
            />
          </div>

          {requiredContribution !== null ? (
            <p className="text-sm leading-relaxed text-muted">
              Con{" "}
              <strong className="font-semibold text-brand">
                {count(expectedUnits)} unidades finales previstas
              </strong>
              , necesitás un aporte promedio de{" "}
              <strong className="font-semibold text-brand">
                {money(requiredContribution)} por unidad final
              </strong>{" "}
              antes de gastos fijos para cubrir el mes.
            </p>
          ) : null}

          <section className="space-y-5 rounded-xl border border-line bg-white p-4 sm:p-5">
            <div>
              <h3 className="font-semibold text-brand">Hipótesis de venta</h3>
              <p className="mt-1 text-xs leading-relaxed text-muted">
                Cada cambio recalcula en memoria. El volumen se expresa en
                unidades finales: un combo cuenta todas sus unidades
                componentes.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <label className="grid content-start gap-2 text-xs font-medium">
                <FieldCaption required>Canal de venta</FieldCaption>
                <select
                  required
                  className="form-control"
                  value={currentInputs.channel}
                  onChange={(event) =>
                    update({ channel: event.target.value as SaleChannel })
                  }
                >
                  {channels.map((channel) => (
                    <option key={channel.id} value={channel.id}>
                      {channel.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid content-start gap-2 text-xs font-medium">
                <FieldCaption required>Medio de pago</FieldCaption>
                <select
                  required
                  className="form-control"
                  value={currentInputs.methodId}
                  aria-invalid={!method || undefined}
                  onChange={(event) => update({ methodId: event.target.value })}
                >
                  <option value="" disabled>
                    {snapshot.methods.length
                      ? "Seleccioná un medio"
                      : "Sin medios configurados"}
                  </option>
                  {snapshot.methods.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
                <span className="font-normal text-muted">
                  {method?.percent == null
                    ? "Comisión pendiente de configuración"
                    : `Comisión configurada: ${quantity(method.percent)}%`}
                </span>
              </label>
              <label className="grid content-start gap-2 text-xs font-medium">
                <FieldCaption>Volumen previsto · unidades finales</FieldCaption>
                <input
                  type="number"
                  min="0"
                  step="1"
                  inputMode="numeric"
                  className="form-control tabular-nums"
                  value={currentInputs.expectedUnits}
                  placeholder="Sin volumen previsto"
                  onChange={(event) =>
                    update({ expectedUnits: event.target.value })
                  }
                />
                <span className="font-normal text-muted">
                  Inicial: {count(snapshot.budget.expectedUnits)}. No modifica
                  el presupuesto.
                </span>
              </label>
              <label className="grid content-start gap-2 text-xs font-medium">
                <FieldCaption>Días de apertura · opcional</FieldCaption>
                <input
                  type="number"
                  min="1"
                  max="31"
                  step="1"
                  inputMode="numeric"
                  className="form-control tabular-nums"
                  value={currentInputs.daysOpen}
                  placeholder="Entre 1 y 31"
                  onChange={(event) => update({ daysOpen: event.target.value })}
                />
                <span className="font-normal text-muted">
                  Para expresar el equilibrio por día.
                </span>
              </label>
            </div>

            <div className="space-y-3 border-t border-line pt-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-2xl">
                  <h3 className="text-sm font-semibold text-brand">
                    Mezcla de ventas
                  </h3>
                  <p className="mt-1 text-xs leading-relaxed text-muted">
                    {currentInputs.source === "historical"
                      ? "Partimos de las proporciones de ventas cerradas de este mes, aplicadas a precios y costos actuales."
                      : currentInputs.source === "partial"
                        ? "Usás sólo la mezcla histórica disponible. Las ventas de productos ya no disponibles quedan excluidas."
                        : "Elegí productos y sus cantidades relativas: 2 de un producto y 1 de otro representan una proporción 2 a 1. Cero excluye un producto."}
                  </p>
                </div>
                {snapshot.historicalMix.length ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      update({
                        entries: snapshot.historicalMix.map((entry) => ({
                          ...entry,
                          quantity: String(entry.quantity),
                        })),
                        source: snapshot.historicalExcludedUnits
                          ? "partial"
                          : "historical",
                      })
                    }
                  >
                    {snapshot.historicalExcludedUnits
                      ? "Usar mezcla disponible"
                      : "Usar mezcla de ventas del mes"}
                  </Button>
                ) : null}
              </div>
              {snapshot.historicalExcludedUnits > 0 ? (
                <p className="text-xs leading-relaxed text-amber-800">
                  Hay {count(snapshot.historicalExcludedUnits)} unidades de
                  ventas históricas de productos no disponibles para este
                  cálculo. La mezcla disponible es parcial; no se aplica
                  automáticamente.
                </p>
              ) : !snapshot.historicalMix.length ? (
                <p className="text-xs text-muted">
                  No hay ventas cerradas disponibles para iniciar una mezcla.
                  Agregá productos para armar tu escenario.
                </p>
              ) : null}
              <label className="grid max-w-lg gap-2 text-xs font-medium">
                <FieldCaption>Agregar producto a la mezcla</FieldCaption>
                <select
                  className="form-control"
                  value=""
                  disabled={selectedProducts.size >= snapshot.products.length}
                  onChange={(event) => {
                    if (!event.target.value) return;
                    update({
                      entries: [
                        ...currentInputs.entries,
                        { productId: event.target.value, quantity: "1" },
                      ],
                      source: "custom",
                    });
                  }}
                >
                  <option value="">Seleccioná un producto…</option>
                  {snapshot.products
                    .filter((product) => !selectedProducts.has(product.id))
                    .map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name}
                        {product.kind === "combo" ? " · combo" : ""}
                      </option>
                    ))}
                </select>
              </label>
              {currentInputs.entries.length ? (
                <div className="divide-y divide-line">
                  {currentInputs.entries.map((entry, index) => {
                    const product = productById.get(entry.productId);
                    const inputId = `${id}-mix-${index}`;
                    return (
                      <div
                        key={`${entry.productId}-${index}`}
                        className="flex flex-wrap items-center gap-3 py-3"
                      >
                        <label
                          htmlFor={inputId}
                          className="min-w-40 flex-1 text-sm font-medium"
                        >
                          <FieldCaption required>
                            {product?.name ?? "Producto no disponible"}
                          </FieldCaption>
                          <span className="mt-1 block text-xs font-normal text-muted">
                            {product?.kind === "combo" ? "Combo · " : ""}
                            {count(product?.finalUnits ?? null)} unidades
                            finales por venta
                          </span>
                        </label>
                        <div className="w-32">
                          <input
                            id={inputId}
                            required
                            type="number"
                            min="0"
                            step="1"
                            inputMode="numeric"
                            aria-label={`Cantidad relativa de ${product?.name ?? "producto no disponible"}`}
                            className="form-control tabular-nums"
                            value={entry.quantity}
                            onChange={(event) =>
                              update({
                                entries: currentInputs.entries.map((item, i) =>
                                  i === index
                                    ? { ...item, quantity: event.target.value }
                                    : item,
                                ),
                                source: "custom",
                              })
                            }
                          />
                          <span className="mt-1 block text-xs text-muted">
                            Cantidad relativa
                          </span>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`Quitar ${product?.name ?? "producto"} de la mezcla`}
                          onClick={() =>
                            update({
                              entries: currentInputs.entries.filter(
                                (_, i) => i !== index,
                              ),
                              source: "custom",
                            })
                          }
                        >
                          <Trash2 size={16} aria-hidden="true" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </section>

          {result.blockers.length ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
              <p className="font-semibold">
                {result.status === "non_positive"
                  ? "Esta mezcla no cubre los gastos al aumentar las ventas"
                  : result.status === "missing_mix"
                    ? "Definí una mezcla para estimar el equilibrio"
                    : "Hay datos por completar"}
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs leading-relaxed">
                {result.blockers.map((blocker, index) => (
                  <li key={index}>{blocker}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <details className="group rounded-xl border border-line bg-white">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 font-semibold text-brand [&::-webkit-details-marker]:hidden">
              Detalle por producto · {count(snapshot.products.length)}
              <ChevronDown
                size={18}
                aria-hidden="true"
                className="shrink-0 transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="space-y-4 border-t border-line p-4">
              <p className="text-xs leading-relaxed text-muted">
                Cada desglose corresponde a una venta, con el canal y medio
                elegidos. Los gastos se asignan según el volumen simulado. El
                equilibrio individual supone vender únicamente ese producto;
                puede diferir del equilibrio de tu mezcla.
              </p>
              {snapshot.products.map((product) => (
                <ProductDetail
                  key={product.id}
                  product={product}
                  result={resultById.get(product.id)}
                  channel={currentInputs.channel}
                />
              ))}
              {!snapshot.products.length ? (
                <p className="text-sm text-muted">
                  No hay productos activos habilitados en esta sucursal.
                </p>
              ) : null}
            </div>
          </details>

          <details className="group rounded-xl border border-line bg-white">
            <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-brand [&::-webkit-details-marker]:hidden">
              Presupuesto y alcance del cálculo
              <ChevronDown
                size={18}
                aria-hidden="true"
                className="shrink-0 transition-transform group-open:rotate-180"
              />
            </summary>
            <div className="space-y-4 border-t border-line p-4 text-xs leading-relaxed text-muted">
              <p>
                El aporte descuenta costo, IVA incluido en el precio, IIBB y
                comisión. Luego se compara con el presupuesto mensual guardado.
                Los gastos fijos se descuentan una sola vez. Los costos
                pendientes no se reemplazan por cero.
              </p>
              <dl className="divide-y divide-line">
                {snapshot.budget.entries.map((entry, index) => (
                  <div key={index} className="flex justify-between gap-4 py-2">
                    <dt>{entry.concept}</dt>
                    <dd className="whitespace-nowrap font-medium tabular-nums text-brand">
                      {money(entry.budget)}
                    </dd>
                  </div>
                ))}
              </dl>
              {snapshot.warnings.length ? (
                <ul className="list-disc space-y-1 pl-5">
                  {snapshot.warnings.map((warning, index) => (
                    <li key={index}>{warning}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          </details>
        </>
      ) : null}
    </section>
  );
}

function Metric({
  label,
  value,
  note,
  negative = false,
}: {
  label: string;
  value: string;
  note: string;
  negative?: boolean;
}) {
  return (
    <div className="bg-white p-4 sm:p-5">
      <p className="text-xs text-muted">{label}</p>
      <p
        className={`mt-2 text-2xl font-bold tracking-tight tabular-nums ${negative ? "text-red-700" : "text-brand"}`}
      >
        {value}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-muted">{note}</p>
    </div>
  );
}

function ProductDetail({
  product,
  result,
  channel,
}: {
  product: BreakEvenSnapshot["products"][number];
  result?: ProductResult;
  channel: SaleChannel;
}) {
  const estimate = product.estimates.find((item) => item.channel === channel);
  const pending = [
    ...new Set([...product.pendingReasons, ...(result?.pendingReasons ?? [])]),
  ];
  return (
    <details className="group/product rounded-lg border border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-4 p-4 [&::-webkit-details-marker]:hidden">
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-brand">
            {product.name}
          </span>
          <span className="mt-1 block text-xs text-muted">
            {product.kind === "combo" ? "Combo · " : ""}
            {count(product.finalUnits)} unidades finales por venta · Aporte
            antes de fijos: {money(result?.contribution ?? null)}
          </span>
        </span>
        <ChevronDown
          size={16}
          aria-hidden="true"
          className="shrink-0 transition-transform group-open/product:rotate-180"
        />
      </summary>
      <div className="space-y-4 border-t border-line p-4">
        <p className="text-xs leading-relaxed text-muted">
          Costo estimado de la composición predeterminada.
          {product.labels.length ? ` ${product.labels.join(" · ")}` : ""}
        </p>
        <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
          {[
            [
              "Precio final al cliente",
              result?.price ?? estimate?.price ?? null,
            ],
            ["IVA incluido en el precio", estimate?.vat ?? null],
            ["Venta sin IVA", estimate?.netPrice ?? null],
            ["Costo del producto", result?.cost ?? null],
            ["IIBB", result?.iibb ?? null],
            ["Comisión del medio", result?.commission ?? null],
            ["Aporte antes de gastos fijos", result?.contribution ?? null],
            ["Gastos fijos asignados", result?.allocatedOverhead ?? null],
            ["Resultado después de fijos", result?.projectedMargin ?? null],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs text-muted">{label}</dt>
              <dd className="mt-1 text-sm font-semibold tabular-nums text-brand">
                {money(value)}
              </dd>
            </div>
          ))}
        </dl>
        <p className="border-t border-line pt-3 text-xs leading-relaxed text-muted">
          {result?.breakEvenSales != null
            ? `Vendiendo sólo este producto: ${count(result.breakEvenSales)} ${product.kind === "combo" ? "combos" : "ventas"} para cubrir el mes, equivalentes a ${count(result.breakEvenUnits)} unidades finales.`
            : result?.status === "non_positive"
              ? "Vendiendo sólo este producto no hay equilibrio por crecimiento: su aporte antes de gastos fijos es cero o negativo."
              : "Equilibrio vendiendo sólo este producto: pendiente de completar los datos."}
        </p>
        {pending.length ? (
          <ul className="list-disc space-y-1 pl-5 text-xs leading-relaxed text-amber-800">
            {pending.map((reason, index) => (
              <li key={index}>{reason}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </details>
  );
}
