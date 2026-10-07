import type { AppDb } from "@/db/client";
import type { Tx } from "@/modules/inventory/service";
import {
  integer,
  roundedDivision,
  SCALE,
  six,
  safeScaled,
} from "@/modules/inventory/decimal";
import { costContext } from "./service";
import type { Component, CompositionCost } from "@/modules/modifiers/types";
export async function costComposition(
  db: AppDb | Tx,
  components: Component[],
): Promise<CompositionCost> {
  const estimate = await costContext(db);
  let total = 0n;
  const missing = new Set<string>();
  const lines = components.map((c) => {
    const result = c.archived
      ? { value: null, missing: [`${c.name} (no disponible)`] }
      : estimate(c.itemId);
    result.missing.forEach((n) => missing.add(n));
    const value =
      result.value === null
        ? null
        : safeScaled(
            roundedDivision(result.value * integer(c.quantity), SCALE),
            24,
          );
    if (value !== null) total += value;
    return {
      itemId: c.itemId,
      cost: value === null ? null : six(value),
    };
  });
  safeScaled(total, 24);
  return {
    totalCost: missing.size ? null : six(total),
    knownSubtotal: six(total),
    missing: [...missing],
    components: lines,
  };
}
