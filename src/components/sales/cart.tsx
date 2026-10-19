"use client";
import { ProductPhoto } from "@/components/products/photo";
import { useEffect, useMemo, useRef, useState } from "react";
import { filterCatalogue } from "./touch-selection";
export { appendCartLine } from "./touch-selection";
import { Coffee, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getJson, money } from "@/components/inventory/shared";
import { inputDecimal } from "@/components/recipes/shared";
import { cents, decimal, integer } from "@/modules/inventory/decimal";
import type { SaleChannel, SaleLookup } from "@/modules/sales/types";
export type CartLine = {
  configurable?: boolean;
  expectedComboVersionId?: string;
  comboChoices?: import("@/modules/sales/validation").LineInput["comboChoices"];
  expectedFulfillmentVersionId?: string;
  expectedRecipeVersionId?: string | null;
  expectedPricingRevision?: number;
  modifiers?: import("@/modules/modifiers/types").Selection[];
  modifierLabels?: string[];
  productId: string;
  name: string;
  quantity: number;
  price: string;
  expectedPrice: string | null;
  priceReason: string;
  notes: string;
};
export function cartTotal(lines: CartLine[]) {
  try {
    return cents(
      lines.reduce(
        (total, line) =>
          total + integer(decimal(line.price, 2)!) * BigInt(line.quantity),
        0n,
      ),
    );
  } catch {
    return null;
  }
}
export function ProductPicker({
  channel,
  locked,
  onAdd,
  refresh,
  onCatalogueLoaded,
}: {
  channel: SaleChannel;
  locked: boolean;
  onAdd: (row: SaleLookup["rows"][number]) => void;
  refresh: number;
  onCatalogueLoaded?: (rows: SaleLookup["rows"]) => void;
}) {
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [retry, setRetry] = useState(0);
  const [data, setData] = useState<SaleLookup>({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const loaded = useRef(onCatalogueLoaded);
  useEffect(() => {
    loaded.current = onCatalogueLoaded;
  }, [onCatalogueLoaded]);
  useEffect(() => {
    let live = true;
    async function load() {
      if (!live) return;
      setLoading(true);
      setError("");
      setData({ rows: [], total: 0 });
      const first = await getJson<SaleLookup>(
        `/api/sales/lookup?kind=products&channel=${channel}&offset=0`,
      );
      const rows = [...first.rows];
      let offset = first.rows.length;
      while (live && offset < first.total) {
        const page = await getJson<SaleLookup>(
          `/api/sales/lookup?kind=products&channel=${channel}&offset=${offset}`,
        );
        if (!page.rows.length) break;
        rows.push(...page.rows);
        offset += page.rows.length;
      }
      if (!live) return;
      const unique = [...new Map(rows.map((row) => [row.id, row])).values()];
      setData({ ...first, rows: unique, total: unique.length });
      loaded.current?.(unique);
    }
    Promise.resolve()
      .then(load)
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [channel, refresh, retry]);
  const rows = useMemo(
    () => filterCatalogue(data.rows, q, category),
    [data.rows, q, category],
  );
  return (
    <section className="surface-panel flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="shrink-0 space-y-3 border-b border-line p-3 sm:p-4">
        <div className="flex items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <Search
              size={18}
              className="pointer-events-none absolute left-3.5 top-4 text-muted"
            />
            <Input
              className="min-h-12 pl-10"
              aria-label="Buscar productos"
              value={q}
              placeholder="Buscar un producto…"
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <span className="shrink-0 text-xs text-muted">
            {rows.length} productos
          </span>
        </div>
        <div
          role="group"
          aria-label="Categorías de productos"
          className="flex gap-2 overflow-x-auto pb-1"
        >
          {[
            { id: "", name: "Todas" },
            ...(data.categories ?? []),
            { id: "none", name: "Sin categoría" },
          ].map((c) => (
            <Button
              key={c.id}
              type="button"
              aria-pressed={category === c.id}
              variant={category === c.id ? "secondary" : "outline"}
              className={`min-h-12 shrink-0 px-4 ${category === c.id ? "border border-blue/30 bg-blue/10 text-blue" : ""}`}
              onClick={() => setCategory(c.id)}
            >
              {c.name}
            </Button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-3 sm:p-4">
        {error ? (
          <div role="alert" className="space-y-3 py-8 text-sm text-red-700">
            <p>{error}</p>
            <Button
              type="button"
              variant="outline"
              className="min-h-12"
              onClick={() => setRetry((n) => n + 1)}
            >
              Reintentar carta
            </Button>
          </div>
        ) : loading ? (
          <p className="py-12 text-center text-sm text-muted" role="status">
            Cargando carta…
          </p>
        ) : rows.length === 0 ? (
          <div className="py-12 text-center">
            <Coffee size={30} className="mx-auto mb-3 text-muted" />
            <p className="text-sm font-semibold text-brand">
              {q || category
                ? "No hay productos con estos filtros"
                : "Tu carta todavía está vacía"}
            </p>
            <p className="mt-2 text-xs text-muted">
              {q || category
                ? "Probá otra categoría o buscá por otro nombre."
                : "Cargá los productos y sus precios para empezar."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-4">
            {rows.map((row) => (
              <button
                key={row.id}
                type="button"
                disabled={
                  locked ||
                  !!row.temporarilySoldOut ||
                  !!row.vatPending ||
                  row.configured === false
                }
                aria-label={`Agregar ${row.name}`}
                onClick={() => onAdd(row)}
                className="flex min-h-36 min-w-0 touch-manipulation flex-col items-start rounded-xl border border-line bg-white p-3 text-left transition-colors active:border-orange-500 active:bg-orange-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue disabled:opacity-50"
              >
                <span className="mb-2 flex w-full items-start justify-between gap-2">
                  <span className="block w-14 shrink-0">
                    <ProductPhoto id={row.imageAssetId} name={row.name} />
                  </span>
                  <Plus size={20} className="mt-1 shrink-0 text-orange-600" />
                </span>
                <span className="text-sm font-bold leading-snug text-brand">
                  {row.name}
                </span>
                {row.temporarilySoldOut ? (
                  <span className="mt-1 text-xs font-bold text-amber-700">
                    Agotado temporalmente
                  </span>
                ) : row.vatPending ? (
                  <span className="mt-1 text-xs font-bold text-amber-700">
                    Configurá el IVA del producto
                  </span>
                ) : row.configured === false ? (
                  <span className="mt-1 text-xs font-bold text-amber-700">
                    Falta completar la ficha
                  </span>
                ) : null}
                <span
                  className={`mt-auto pt-2 text-sm font-extrabold tabular-nums ${row.price == null ? "text-amber-700" : "text-brand"}`}
                >
                  {row.vatPending
                    ? "IVA pendiente"
                    : row.price == null
                      ? "Sin precio"
                      : money(row.price)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
export { Cart } from "./cart-order";
export function newCartLine(row: SaleLookup["rows"][number]): CartLine {
  return {
    expectedPricingRevision: row.pricingRevision,
    expectedFulfillmentVersionId: row.fulfillmentVersionId ?? undefined,
    productId: row.id,
    name: row.name,
    quantity: 1,
    price:
      row.price === null || row.price === undefined
        ? ""
        : inputDecimal(row.price),
    expectedPrice: row.price ?? null,
    priceReason: "",
    notes: "",
  };
}
