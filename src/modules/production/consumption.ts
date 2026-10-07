import type { StockAllocation } from "../operations/types";
import { integer, six } from "../inventory/decimal";
import { AppError } from "@/lib/errors";
export function planConsumption(
  reserved: StockAllocation[],
  actual: { itemId: string; quantity: string }[],
) {
  const ids = [...new Set(reserved.map((a) => a.itemId))];
  if (
    actual.length !== ids.length ||
    new Set(actual.map((a) => a.itemId)).size !== ids.length ||
    actual.some(
      (a) => !ids.includes(a.itemId) || !/^\d{1,12}\.\d{6}$/.test(a.quantity),
    )
  )
    throw new AppError(
      "PRODUCTION_CONFLICT",
      "Indicá el consumo real de cada artículo confirmado.",
      409,
    );
  const consume: StockAllocation[] = [],
    release: StockAllocation[] = [],
    extra: { itemId: string; quantity: string }[] = [];
  for (const itemId of ids) {
    let needed = integer(actual.find((a) => a.itemId === itemId)!.quantity);
    for (const a of reserved.filter((r) => r.itemId === itemId)) {
      const available = integer(a.quantity),
        used = available < needed ? available : needed;
      if (used > 0n) consume.push({ ...a, quantity: six(used) });
      if (available > used)
        release.push({ ...a, quantity: six(available - used) });
      needed -= used;
    }
    if (needed > 0n) extra.push({ itemId, quantity: six(needed) });
  }
  return { consume, release, extra };
}
