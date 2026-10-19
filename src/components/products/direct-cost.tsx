"use client";
import {
  ProductCostSummary,
  useProductCosts,
} from "@/components/catalog/product-costs";
export function ProductDirectCost({
  productId,
  revision,
}: {
  productId: string;
  revision: number;
}) {
  const costs = useProductCosts([productId], true, revision);
  return (
    <div className="space-y-4 rounded-xl border border-line p-6">
      <h3 className="font-semibold text-brand">
        Costo del producto comprado listo
      </h3>
      <ProductCostSummary
        model={costs?.products[productId]}
        error={costs?.error}
      />
      <p className="text-sm text-muted">
        Se multiplica la cantidad de unidades por el costo del artículo de
        inventario de la sucursal. Sin stock, se usa el costo de referencia del
        artículo.
      </p>
    </div>
  );
}
