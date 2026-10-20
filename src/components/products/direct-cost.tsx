"use client";
import { ProductCostSummary } from "@/components/catalog/product-costs";
import type { ProductCost } from "@/modules/catalog/product-cost-model";
export function ProductDirectCost({
  model,
  error,
}: {
  model?: ProductCost;
  error?: string;
}) {
  return (
    <div className="space-y-4 rounded-xl border border-line p-6">
      <h3 className="font-semibold text-brand">
        Costo del producto comprado listo
      </h3>
      <ProductCostSummary model={model} error={error} />
      <p className="text-sm text-muted">
        Se multiplica la cantidad de unidades por el costo del artículo de
        inventario de la sucursal. Sin stock, se usa el costo de referencia del
        artículo.
      </p>
    </div>
  );
}
