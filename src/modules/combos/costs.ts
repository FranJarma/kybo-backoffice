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
  for (const group of definition.groups) {
    const options = group.options
      .filter(
        (o) =>
          !o.archived &&
          (!availableProductIds || availableProductIds.has(o.productId)),
      )
      .map((o) => costs.get(o.productId));
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
    referenceItems: [...refs],
  };
}
