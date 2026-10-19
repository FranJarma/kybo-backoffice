import type { ComboDefinition } from "./service";
import type { ProductCost } from "../catalog/product-cost-model";
import { integer, six } from "../inventory/decimal";
export function comboCostRange(
  definition: ComboDefinition,
  costs: Map<string, ProductCost>,
  availableProductIds?: Set<string>,
): ProductCost {
  let min = 0n,
    max = 0n,
    unknown = false;
  const refs = new Set<string>();
  const pendingReasons = new Set<string>();
  for (const group of definition.groups) {
    const activeOptions = group.options.filter((o) => !o.archived);
    const eligible = activeOptions.filter(
      (o) => !availableProductIds || availableProductIds.has(o.productId),
    );
    if (!eligible.length) {
      unknown = true;
      pendingReasons.add(
        activeOptions.length
          ? `${group.name}: no hay opciones habilitadas y disponibles en esta sucursal (${activeOptions.map((o) => o.name).join(", ")}).`
          : `${group.name}: no tiene productos activos. Revisá sus componentes.`,
      );
    }
    // When nothing is enabled, expose configuration omissions too so fixing
    // availability does not merely replace one unexplained pending state with another.
    for (const option of eligible.length ? eligible : activeOptions) {
      const cost = costs.get(option.productId);
      if (!cost || cost.status === "unconfigured")
        pendingReasons.add(
          `${option.name}: falta publicar su receta o vincular un artículo de venta directa.`,
        );
      else if (cost.min === null || cost.max === null)
        pendingReasons.add(
          `${option.name}: hay ingredientes o artículos con costo pendiente. Revisá el costeo de ese producto.`,
        );
    }
    const options = eligible.map((o) => costs.get(o.productId));
    if (
      !options.length ||
      options.some((o) => !o || o.min === null || o.max === null)
    ) {
      unknown = true;
      continue;
    }
    const mins = options.map((o) => integer(o!.min!)),
      maxs = options.map((o) => integer(o!.max!));
    min += mins.reduce((a, b) => (a < b ? a : b)) * BigInt(group.quantity);
    max += maxs.reduce((a, b) => (a > b ? a : b)) * BigInt(group.quantity);
    options.forEach((o) => o!.referenceItems.forEach((r) => refs.add(r)));
  }
  return {
    productId: definition.productId,
    status: unknown ? "pending" : "ready",
    min: unknown ? null : six(min),
    max: unknown ? null : six(max),
    fixed: null,
    defaultCost: null,
    groups: [],
    pendingReasons: [...pendingReasons],
    referenceItems: [...refs],
  };
}
