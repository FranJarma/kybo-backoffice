"use client";
import { OperationAlert } from "@/components/ui/operation-alert";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { ChevronDown, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CostingBreakdown } from "./costing-breakdown";
import { money, quantity } from "@/lib/number-format";
import type { ProductCost } from "@/modules/catalog/product-cost-model";
import type { SaleChannel } from "@/modules/sales/types";
import {
  estimateProfitability,
  type ProfitabilityData,
} from "@/modules/pricing/product-profitability";

type ProfitabilityResponse = {
  branchName: string;
  products: ProductCost[];
  profitability: ProfitabilityData[];
};
async function loadProfitability(
  productId: string,
  month: string,
): Promise<ProfitabilityResponse> {
  const response = await fetch("/api/products/costs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ids: [productId],
      profitability: true,
      ...(month ? { month } : {}),
    }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "No pudimos consultar la rentabilidad.");
  return result;
}

export function useProductProfitability(
  productId: string,
  active: boolean,
  revision: string | number,
) {
  const [generation, setGeneration] = useState(0);
  const [month, setMonth] = useState("");
  const key = `${productId}:${revision}:${month}:${generation}`;
  const request = useRef<{
    key: string;
    promise: Promise<ProfitabilityResponse>;
  }>(null);
  const [state, setState] = useState<{
    key: string;
    result?: ProfitabilityResponse;
    error?: string;
  }>();
  useEffect(() => {
    if (!active || !productId) return;
    let live = true;
    // Keep a single request through tab changes and Strict Mode effect replay.
    if (request.current?.key !== key)
      request.current = { key, promise: loadProfitability(productId, month) };
    request.current.promise.then(
      (result) => {
        if (live) setState({ key, result });
      },
      (error: Error) => {
        if (live) setState({ key, error: error.message });
      },
    );
    return () => {
      live = false;
    };
  }, [active, productId, key, month]);
  const reload = useCallback(() => setGeneration((n) => n + 1), []);
  return {
    result: state?.key === key ? state.result : undefined,
    error: state?.key === key ? state.error : undefined,
    reload,
    month,
    setMonth,
  };
}

const channelNames: Record<SaleChannel, string> = {
  counter: "Mostrador",
  pedidosya: "PedidosYa",
  ubereats: "Uber Eats",
};

export function ProductProfitability({
  result,
  error,
  onRefresh,
  month,
  onMonthChange,
}: {
  result?: ProfitabilityResponse;
  error?: string;
  onRefresh: () => void;
  month: string;
  onMonthChange: (month: string) => void;
}) {
  const id = useId();
  const [channel, setChannel] = useState<SaleChannel>("counter");
  const [methodId, setMethodId] = useState("");
  const [choices, setChoices] = useState<Record<string, string>>({});
  const data = result?.profitability[0];
  const estimate = useMemo(
    () => (data ? estimateProfitability(data, channel, choices) : null),
    [data, channel, choices],
  );
  const method =
    estimate?.methods.find((m) => m.id === methodId) ?? estimate?.methods[0];
  const loading = !result && !error;
  const pending =
    data && estimate
      ? [
          ...(data.vatRate === null ? ["IVA del producto"] : []),
          ...(estimate.finalPrice === null
            ? [estimate.priceError || "precio o configuración del canal"]
            : []),
          ...(estimate.cost === null ? ["costo o receta publicada"] : []),
          ...(!method
            ? ["medio de pago"]
            : method.percent === null
              ? ["comisión del medio de pago"]
              : []),
          ...(data.overhead?.iibbRate == null ? ["IIBB del mes"] : []),
          ...(estimate.overheadAmount === null
            ? ["gastos y unidades previstas del mes"]
            : []),
        ]
      : [];
  return (
    <section aria-label="Rentabilidad por medio de pago" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="font-semibold text-brand">Costeo por venta</h3>
          <p className="mt-1 text-xs text-muted">
            Una venta · {result?.branchName ?? "Sucursal seleccionada"} · Datos
            guardados
          </p>
        </div>
        <Button
          type="button"
          variant="ghost"
          disabled={loading}
          onClick={onRefresh}
        >
          <RefreshCw size={16} aria-hidden="true" /> Actualizar estimación
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
        <label
          htmlFor={`${id}-channel`}
          className="grid min-w-0 gap-2 text-xs font-medium"
        >
          Canal de venta
          <select
            id={`${id}-channel`}
            className="form-control min-w-0"
            value={channel}
            onChange={(e) => setChannel(e.target.value as SaleChannel)}
            disabled={!data}
          >
            {(
              data?.channels ?? [{ id: "counter" as const, enabled: true }]
            ).map((c) => (
              <option key={c.id} value={c.id}>
                {channelNames[c.id]}
                {!c.enabled ? " · no habilitado" : ""}
              </option>
            ))}
          </select>
        </label>
        <label
          htmlFor={`${id}-method`}
          className="grid min-w-0 gap-2 text-xs font-medium"
        >
          Medio de pago
          <select
            id={`${id}-method`}
            className="form-control min-w-0"
            value={method?.id ?? ""}
            onChange={(e) => setMethodId(e.target.value)}
            disabled={!estimate?.methods.length}
          >
            {!estimate?.methods.length && (
              <option value="">Sin medios de pago</option>
            )}
            {estimate?.methods.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label
          htmlFor={`${id}-month`}
          className="col-span-2 grid min-w-0 gap-2 text-xs font-medium sm:col-span-1"
        >
          Mes del presupuesto
          <input
            id={`${id}-month`}
            type="month"
            min="2000-01"
            max="2099-12"
            className="form-control min-w-0"
            value={month || data?.overhead?.month || ""}
            onChange={(e) => {
              if (e.target.value) onMonthChange(e.target.value);
            }}
          />
        </label>
      </div>
      {error ? (
        <>
          <OperationAlert
            message={error}
            title="No pudimos calcular la rentabilidad"
            tone="error"
          />
          <p className="text-sm text-muted">Estimación sin calcular.</p>
        </>
      ) : !estimate || !data ? (
        <p role="status" className="py-6 text-sm text-muted">
          Consultando rentabilidad…
        </p>
      ) : (
        <>
          {data.groups.length > 0 && (
            <details className="group rounded-xl border border-line">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                Composición del combo
                <ChevronDown
                  size={18}
                  aria-hidden="true"
                  className="shrink-0 transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="grid gap-4 px-4 pb-4 sm:grid-cols-2">
                {data.groups.map((group) => (
                  <label
                    key={group.id}
                    htmlFor={`${id}-${group.id}`}
                    className="grid min-w-0 gap-2 text-sm"
                  >
                    <span>
                      {group.name} · {group.quantity}{" "}
                      {group.quantity === 1 ? "unidad" : "unidades"}
                    </span>
                    <select
                      id={`${id}-${group.id}`}
                      className="form-control min-w-0"
                      value={choices[group.id] ?? group.options[0]?.id ?? ""}
                      onChange={(e) =>
                        setChoices((previous) => ({
                          ...previous,
                          [group.id]: e.target.value,
                        }))
                      }
                    >
                      {!group.options.length && (
                        <option value="">
                          Sin opciones disponibles en esta sucursal
                        </option>
                      )}
                      {group.options.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
            </details>
          )}
          <dl
            aria-label="Resumen por venta"
            className="grid grid-cols-2 gap-3 sm:grid-cols-3"
          >
            <div className="rounded-xl border border-line p-4">
              <dt className="text-sm text-muted">Precio al cliente</dt>
              <dd
                data-testid="costing-price"
                className="mt-2 break-words text-xl font-semibold tracking-tight text-brand tabular-nums sm:text-2xl"
              >
                {money(estimate.finalPrice)}
              </dd>
              <dd className="mt-1 text-xs text-muted">IVA incluido</dd>
            </div>
            <div className="rounded-xl border border-line p-4">
              <dt className="text-sm text-muted">Costo del producto</dt>
              <dd
                data-testid="costing-direct"
                className="mt-2 break-words text-xl font-semibold tracking-tight text-brand tabular-nums sm:text-2xl"
              >
                {money(estimate.cost)}
              </dd>
              <dd className="mt-1 text-xs text-muted">
                Ingredientes o compra directa
              </dd>
            </div>
            <div
              className={`col-span-2 rounded-xl border p-4 sm:col-span-1 ${method?.marginAfterOverhead == null ? "border-line bg-slate-50" : method.marginAfterOverhead.startsWith("-") ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50/60"}`}
            >
              <dt className="text-sm text-brand">Margen final estimado</dt>
              <dd
                data-testid="costing-margin"
                aria-live="polite"
                className={`mt-2 break-words text-2xl font-semibold tracking-tight tabular-nums ${method?.marginAfterOverhead?.startsWith("-") ? "text-red-700" : "text-brand"}`}
              >
                {money(method?.marginAfterOverhead ?? null)}
              </dd>
              <dd className="mt-1 text-xs text-muted">
                Después de impuestos, comisión y gastos
              </dd>
            </div>
          </dl>
          {!!pending.length && (
            <p
              role="status"
              className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-900"
            >
              Para completar el margen: {pending.join(" · ")}. Los datos
              pendientes no se toman como cero.
            </p>
          )}
          <div className="grid items-start gap-4 lg:grid-cols-[1.15fr_1fr]">
            <section
              aria-label="Desglose por venta"
              className="rounded-xl border border-line p-4 sm:px-5"
            >
              <h4 className="mb-2 text-sm font-semibold text-brand">
                Qué se descuenta de esta venta
              </h4>
              <dl className="divide-y divide-line/70 text-sm">
                {[
                  { label: "Costo del producto", amount: estimate.cost },
                  {
                    label: `IVA incluido${data.vatRate === null ? "" : ` · ${quantity(data.vatRate)}%`}`,
                    amount: estimate.vatAmount,
                    testId: "costing-vat",
                  },
                  {
                    label: `IIBB${data.overhead?.iibbRate == null ? "" : ` · ${quantity(data.overhead.iibbRate)}%`}`,
                    amount: estimate.iibbAmount,
                    testId: "costing-iibb",
                  },
                  {
                    label: `Comisión${method?.percent == null ? "" : ` · ${quantity(method.percent)}%`}`,
                    amount: method?.commission ?? null,
                    testId: "costing-commission",
                  },
                  {
                    label: "Gastos fijos y generales",
                    amount: estimate.overheadAmount,
                    testId: "assigned-overhead",
                  },
                ].map((row) => (
                  <div
                    key={row.label}
                    className="flex items-baseline justify-between gap-4 py-2.5"
                  >
                    <dt className="text-muted">{row.label}</dt>
                    <dd
                      data-testid={row.testId}
                      className="shrink-0 font-medium tabular-nums"
                    >
                      {money(row.amount)}
                    </dd>
                  </div>
                ))}
              </dl>
              {method?.marginAfterOverhead === null &&
                method.margin !== null && (
                  <p className="mt-2 border-t border-line pt-3 text-xs leading-relaxed text-muted">
                    Antes de IIBB y gastos:{" "}
                    <strong
                      className={
                        method.margin.startsWith("-")
                          ? "text-red-700"
                          : "text-brand"
                      }
                    >
                      {money(method.margin)}
                    </strong>
                    . Todavía no es el margen final.
                  </p>
                )}
            </section>
            <CostingBreakdown data={data} estimate={estimate} />
          </div>
          {!!estimate.labels.length && (
            <p className="text-xs leading-relaxed text-muted">
              Opciones consideradas: {estimate.labels.join(" · ")}.
            </p>
          )}
          {data.methods.length ? (
            <details className="group rounded-xl border border-line">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
                Comparar medios de pago ({data.methods.length})
                <ChevronDown
                  size={18}
                  aria-hidden="true"
                  className="shrink-0 transition-transform group-open:rotate-180"
                />
              </summary>
              <div className="overflow-x-auto px-4 pb-4">
                <table className="w-full text-left text-sm">
                  <caption className="pb-3 text-left text-xs text-muted">
                    Una venta cobrada por completo con cada medio. El cliente
                    paga el mismo precio.
                  </caption>
                  <thead>
                    <tr className="border-b border-line">
                      <th scope="col" className="py-2 font-medium">
                        Medio de pago
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-2 text-right font-medium"
                      >
                        Comisión
                      </th>
                      <th scope="col" className="py-2 text-right font-medium">
                        Margen final
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {estimate.methods.map((m) => (
                      <tr
                        key={m.id}
                        className="border-b border-line/60 last:border-0"
                      >
                        <th
                          scope="row"
                          className="py-3 pr-3 font-medium text-brand"
                        >
                          {m.name}
                          <span className="mt-1 block text-xs font-normal text-muted">
                            {m.percent === null
                              ? "Comisión pendiente"
                              : `${quantity(m.percent)}%`}
                          </span>
                        </th>
                        <td className="px-3 py-3 text-right whitespace-nowrap tabular-nums">
                          {money(m.commission)}
                        </td>
                        <td
                          className={`py-3 text-right font-semibold whitespace-nowrap tabular-nums ${m.marginAfterOverhead?.startsWith("-") ? "text-red-700" : "text-brand"}`}
                        >
                          {money(m.marginAfterOverhead)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <Link
                  className="text-xs text-blue underline underline-offset-4"
                  href="/settings/payment-methods"
                >
                  Configurar comisiones
                </Link>
              </div>
            </details>
          ) : (
            <p className="text-sm text-muted">
              No hay medios de pago activos.{" "}
              <Link
                className="text-blue underline"
                href="/settings/payment-methods"
              >
                Configurar medios de pago
              </Link>
            </p>
          )}
        </>
      )}
    </section>
  );
}
