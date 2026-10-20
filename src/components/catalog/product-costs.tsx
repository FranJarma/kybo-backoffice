"use client";
import { useEffect, useRef, useState } from "react";
import { money } from "@/lib/number-format";
import type { ProductCost } from "@/modules/catalog/product-cost-model";
import { createProductCostLoader } from "./product-cost-cache";

async function fetchCosts(ids: string[]) {
  const response = await fetch("/api/products/costs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(result.error ?? "No pudimos calcular los costos.");
  return result as { branchName: string; products: ProductCost[] };
}

export function useProductCosts(
  ids: string[],
  enabled: boolean,
  refresh: number,
) {
  const key = JSON.stringify([...new Set(ids)].sort());
  const cache = useRef<{
    refresh: number;
    load: ReturnType<typeof createProductCostLoader>;
  }>(null);
  const [state, setState] = useState<{
    refresh: number;
    products: Record<string, ProductCost>;
    branchName: string;
    error: string;
  }>();
  useEffect(() => {
    if (!cache.current || cache.current.refresh !== refresh)
      cache.current = {
        refresh,
        load: createProductCostLoader(fetchCosts, (result) => {
          if (cache.current?.refresh !== refresh) return;
          setState((old) => ({
            refresh,
            products: {
              ...(old?.refresh === refresh ? old.products : {}),
              ...Object.fromEntries(
                result.products.map((p) => [p.productId, p]),
              ),
            },
            branchName: result.branchName,
            error: old?.refresh === refresh ? old.error : "",
          }));
        }),
      };
    const requested = JSON.parse(key) as string[];
    if (!enabled || !requested.length) return;
    let live = true;
    // Keep in-flight requests in the cache across UI changes and Strict Mode replay.
    void cache.current
      .load(requested)
      .then((result) => {
        if (!live) return;
        setState((old) => ({
          refresh,
          products: {
            ...(old?.refresh === refresh ? old.products : {}),
            ...Object.fromEntries(result.products.map((p) => [p.productId, p])),
          },
          branchName: result.branchName,
          error: "",
        }));
      })
      .catch((error: Error) => {
        if (live)
          setState((old) => ({
            refresh,
            products: old?.refresh === refresh ? old.products : {},
            branchName: old?.refresh === refresh ? old.branchName : "",
            error: error.message,
          }));
      });
    return () => {
      live = false;
    };
  }, [key, enabled, refresh]);
  return state?.refresh === refresh ? state : undefined;
}
export function ProductCostSummary({
  model,
  error,
}: {
  model?: ProductCost;
  error?: string;
}) {
  return (
    <div className="py-2 text-sm text-brand tabular-nums">
      <span className="min-w-32">
        {!model ? (
          error ? (
            "No disponible"
          ) : (
            "Calculando…"
          )
        ) : model.status === "unconfigured" ? (
          "Sin receta ni consumo"
        ) : model.min === null || model.max === null ? (
          "Costo pendiente"
        ) : money(model.min) === money(model.max) ? (
          money(model.min)
        ) : (
          <>
            {money(model.min)} – {money(model.max)}
          </>
        )}
        {model && (
          <span className="mt-1 block text-xs font-normal text-muted">
            {model.referenceItems.length
              ? "Incluye referencias"
              : "Costo estimado"}
          </span>
        )}
      </span>
    </div>
  );
}
