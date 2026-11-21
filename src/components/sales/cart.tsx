"use client";
import { OperationAlert } from "@/components/ui/operation-alert";
import { ProductCard } from "./product-card";
import { productCardModel } from "./pos-presentation";
import { useEffect, useMemo, useRef, useState } from "react";
import { filterCatalogue } from "./touch-selection";
export { appendCartLine } from "./touch-selection";
import { Coffee, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { createCatalogueLoader, emptyCatalogue } from "./catalogue-loader";
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
  quantities = {},
}: {
  channel: SaleChannel;
  locked: boolean;
  onAdd: (row: SaleLookup["rows"][number]) => void;
  refresh: number;
  onCatalogueLoaded?: (rows: SaleLookup["rows"]) => void;
  quantities?: Readonly<Record<string, number>>;
}) {
  const [category, setCategory] = useState("");
  const [q, setQ] = useState("");
  const [catalogue, setCatalogue] = useState(emptyCatalogue);
  const { data, loading, error, errorAttempt, complete } = catalogue;
  const resource = useRef<ReturnType<typeof createCatalogueLoader> | null>(
    null,
  );
  const loaded = useRef(onCatalogueLoaded);
  useEffect(() => {
    loaded.current = onCatalogueLoaded;
  }, [onCatalogueLoaded]);
  useEffect(() => {
    const loader = createCatalogueLoader({
      channel,
      onChange: setCatalogue,
      onComplete: (rows) => loaded.current?.(rows),
    });
    resource.current = loader;
    void Promise.resolve().then(() => loader.load());
    return () => {
      loader.dispose();
      if (resource.current === loader) resource.current = null;
    };
  }, [channel, refresh]);
  const rows = useMemo(
    () => filterCatalogue(data.rows, q, category),
    [data.rows, q, category],
  );
  return (
    <section className="pos-catalog flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="pos-catalog-header shrink-0 space-y-3">
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
          <span className="sr-only">{rows.length} productos</span>
        </div>
        <div
          role="group"
          aria-label="Categorías de productos"
          className="pos-category-filter flex gap-2 overflow-x-auto pb-1"
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
              className="shrink-0 px-4"
              onClick={() => setCategory(c.id)}
            >
              {c.name}
            </Button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-3">
        {error && (
          <div className="space-y-3 pb-4 text-sm">
            <OperationAlert
              eventKey={errorAttempt}
              tone="error"
              title={
                data.rows.length
                  ? "Falta completar la carta"
                  : "No pudimos cargar la carta"
              }
              message={error}
            />
            <Button
              type="button"
              variant="outline"
              className="min-h-12"
              onClick={() => void resource.current?.load()}
            >
              Reintentar carta
            </Button>
          </div>
        )}
        {loading && data.rows.length > 0 && (
          <p className="pb-3 text-sm text-muted" role="status">
            Completando la carta: {data.rows.length} de {data.total} productos.
            La búsqueda se actualizará al terminar.
          </p>
        )}
        {loading && data.rows.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted" role="status">
            Cargando carta…
          </p>
        ) : error && data.rows.length === 0 ? null : rows.length === 0 ? (
          <div className="py-12 text-center">
            <Coffee size={30} className="mx-auto mb-3 text-muted" />
            <p className="text-sm font-semibold text-brand">
              {!complete
                ? "Todavía no hay coincidencias entre los productos cargados"
                : q || category
                  ? "No hay productos con estos filtros"
                  : "Tu carta todavía está vacía"}
            </p>
            <p className="mt-2 text-xs text-muted">
              {!complete
                ? "Falta completar la carta para buscar en todos los productos."
                : q || category
                  ? "Probá otra categoría o buscá por otro nombre."
                  : "Cargá los productos y sus precios para empezar."}
            </p>
          </div>
        ) : (
          <div className="pos-product-grid">
            {rows.map((row) => (
              <ProductCard
                key={row.id}
                product={productCardModel(row)}
                quantity={quantities[row.id] ?? 0}
                locked={locked}
                onSelect={() => onAdd(row)}
              />
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
