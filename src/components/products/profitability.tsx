"use client";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import Link from "next/link";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
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
): Promise<ProfitabilityResponse> {
  const response = await fetch("/api/products/costs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids: [productId], profitability: true }),
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
  const key = `${productId}:${revision}:${generation}`;
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
      request.current = { key, promise: loadProfitability(productId) };
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
  }, [active, productId, key]);
  const reload = useCallback(() => setGeneration((n) => n + 1), []);
  return {
    result: state?.key === key ? state.result : undefined,
    error: state?.key === key ? state.error : undefined,
    reload,
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
}: {
  result?: ProfitabilityResponse;
  error?: string;
  onRefresh: () => void;
}) {
  const id = useId();
  const [channel, setChannel] = useState<SaleChannel>("counter");
  const [choices, setChoices] = useState<Record<string, string>>({});
  const data = result?.profitability[0];
  const estimate = useMemo(
    () => (data ? estimateProfitability(data, channel, choices) : null),
    [data, channel, choices],
  );
  const loading = !result && !error;
  return (
    <section
      aria-label="Rentabilidad por medio de pago"
      className="mt-6 space-y-5 rounded-xl border border-line bg-white p-5 sm:p-6"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h3 className="font-semibold text-brand">
            Rentabilidad por medio de pago
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Una unidad, con precios guardados, receta publicada y opciones
            predeterminadas. La comisión es un costo interno y se calcula sobre
            el precio final con IVA; el cliente paga el mismo importe.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          disabled={loading}
          onClick={onRefresh}
        >
          <RefreshCw size={16} aria-hidden="true" /> Actualizar estimación
        </Button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : !estimate || !data ? (
        <p role="status" className="text-sm text-muted">
          Consultando rentabilidad…
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-end justify-between gap-5">
            <label
              htmlFor={`${id}-channel`}
              className="block w-full space-y-2 text-sm font-medium sm:max-w-xs"
            >
              <span>Canal de venta</span>
              <select
                id={`${id}-channel`}
                className="form-control"
                value={channel}
                onChange={(e) => setChannel(e.target.value as SaleChannel)}
              >
                {data.channels.map((c) => (
                  <option key={c.id} value={c.id}>
                    {channelNames[c.id]}
                    {!c.enabled ? " · no habilitado" : ""}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-sm text-muted">
              Sucursal:{" "}
              <span className="font-medium text-brand">
                {result?.branchName}
              </span>
            </p>
          </div>
          {data.groups.length > 0 && (
            <fieldset className="space-y-4 rounded-lg border border-line p-4">
              <legend className="px-2 text-sm font-medium">
                Productos del combo a comparar
              </legend>
              <div className="grid gap-4 sm:grid-cols-2">
                {data.groups.map((group) => (
                  <label
                    key={group.id}
                    htmlFor={`${id}-${group.id}`}
                    className="block space-y-2 text-sm"
                  >
                    <span>
                      {group.name} · {group.quantity}{" "}
                      {group.quantity === 1 ? "unidad" : "unidades"}
                    </span>
                    <select
                      id={`${id}-${group.id}`}
                      className="form-control"
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
            </fieldset>
          )}
          {estimate.labels.length > 0 && (
            <p className="text-xs leading-relaxed text-muted">
              Configuración de referencia: {estimate.labels.join(" · ")}.
            </p>
          )}
          <div className="flex flex-wrap justify-between gap-3 border-y border-line py-4 text-sm">
            <span className="text-muted">
              Precio final al cliente{" "}
              {data.vatRate !== null
                ? `(IVA ${quantity(data.vatRate)}%)`
                : "· IVA pendiente"}
            </span>
            <strong className="text-brand tabular-nums">
              {money(estimate.finalPrice)}
            </strong>
          </div>
          {(data.vatRate === null ||
            estimate.netPrice === null ||
            estimate.cost === null) && (
            <p role="status" className="text-sm leading-relaxed text-amber-800">
              {data.vatRate === null && "Configurá el IVA del producto. "}
              {estimate.netPrice === null &&
                (estimate.priceError ||
                  "Completá el precio y los recargos de las opciones predeterminadas para este canal y verificá que esté habilitado. ")}
              {estimate.cost === null &&
                "Falta el costo o una configuración predeterminada válida de la receta publicada. "}
              Los datos pendientes no se consideran cero.
            </p>
          )}
          {!data.methods.length ? (
            <p className="text-sm text-muted">
              No hay medios de pago activos.{" "}
              <Link
                className="text-blue underline"
                href="/settings/payment-methods"
              >
                Configurar medios de pago
              </Link>
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <caption className="pb-3 text-left text-xs leading-relaxed text-muted">
                  Cada fila supone que se cobra el total con ese medio de pago.
                  Margen = precio sin IVA − costo del producto − comisión.
                </caption>
                <thead>
                  <tr className="border-b border-line">
                    {[
                      "Medio de pago",
                      "Precio sin IVA",
                      "Costo del producto",
                      "Comisión",
                      "Margen estimado",
                    ].map((label, index) => (
                      <th
                        key={label}
                        scope="col"
                        className={`px-3 py-3 font-medium whitespace-nowrap ${index ? "text-right" : "pl-0"}`}
                      >
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {estimate.methods.map((method) => (
                    <tr
                      key={method.id}
                      className="border-b border-line/60 last:border-0"
                    >
                      <th
                        scope="row"
                        className="py-4 pr-3 font-medium text-brand"
                      >
                        {method.name}
                        <span className="mt-1 block text-xs font-normal text-muted">
                          {method.percent === null
                            ? "Comisión pendiente"
                            : `${quantity(method.percent)}% sobre el precio final`}
                        </span>
                      </th>
                      <td className="px-3 py-4 text-right whitespace-nowrap text-muted tabular-nums">
                        {money(estimate.netPrice)}
                      </td>
                      <td className="px-3 py-4 text-right whitespace-nowrap text-muted tabular-nums">
                        {money(estimate.cost)}
                      </td>
                      <td className="px-3 py-4 text-right whitespace-nowrap text-muted tabular-nums">
                        {money(method.commission)}
                      </td>
                      <td
                        className={`px-3 py-4 text-right font-semibold whitespace-nowrap tabular-nums ${method.margin?.startsWith("-") ? "text-red-700" : "text-brand"}`}
                      >
                        {money(method.margin)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs leading-relaxed text-muted">
            Estimación antes de sueldos, alquiler y otros gastos. Usa los costos
            registrados de la sucursal, incluidas mermas y referencias cuando
            corresponda. Las comisiones sin configurar dejan el margen
            pendiente; podés completarlas en{" "}
            <Link
              className="text-blue underline-offset-4 hover:underline"
              href="/settings/payment-methods"
            >
              Medios de pago
            </Link>
            .
          </p>
        </>
      )}
    </section>
  );
}
