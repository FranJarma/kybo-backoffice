import { integer, six } from "../inventory/decimal";
import type { ReplenishmentSnapshot } from "../replenishment/types";
import type { dailyOperationTasks } from "@/db/daily-operation-schema";
export function buildDailySuggestions(
  snapshot: ReplenishmentSnapshot,
  preparationIds: Set<string>,
  committed: Map<string, bigint>,
) {
  const result: (typeof dailyOperationTasks.$inferInsert)[] = [];
  // Source budget is shared across destinations; do not promise the same units twice.
  const sourceBudget = new Map<string, bigint>();
  for (const a of snapshot.alerts)
    for (const s of a.sources)
      sourceBudget.set(
        `${a.itemId}:${s.locationId}`,
        (() => {
          const target = snapshot.policies.find(
            (p) =>
              p.enabled &&
              p.itemId === a.itemId &&
              p.locationId === s.locationId,
          )?.targetQuantity;
          const surplus =
            integer(s.availableQuantity) - (target ? integer(target) : 0n);
          return surplus > 0n ? surplus : 0n;
        })(),
      );
  for (const a of snapshot.alerts) {
    let remaining =
      integer(a.targetQuantity) -
      integer(a.availableQuantity) -
      (committed.get(`${a.itemId}:${a.locationId}`) ?? 0n);
    const common = {
      branchId: "",
      itemId: a.itemId,
      unit: a.baseUnit,
      locationId: a.locationId,
      urgency: "high" as const,
      reason:
        a.severity === "empty"
          ? "Sin stock disponible en esta ubicación. Revisá la reposición."
          : "El disponible llegó al mínimo configurado.",
    };
    for (const source of a.sources) {
      const key = `${a.itemId}:${source.locationId}`,
        available = sourceBudget.get(key) ?? 0n,
        q = available < remaining ? available : remaining;
      if (q <= 0n) continue;
      result.push({
        ...common,
        kind: "transfer",
        title: `Reponer ${a.itemName}`,
        originLocationId: source.locationId,
        quantity: six(q),
        needKey: `${a.id}:transfer:${source.locationId}`,
      });
      remaining -= q;
      sourceBudget.set(key, available - q);
    }
    if (remaining > 0n) {
      const kind = preparationIds.has(a.itemId) ? "production" : "purchase";
      result.push({
        ...common,
        kind,
        title: `${kind === "production" ? "Preparar" : "Revisar compra de"} ${a.itemName}`,
        quantity: six(remaining),
        needKey: `${a.id}:${kind}`,
        reason:
          common.reason +
          (kind === "purchase"
            ? " Esta etapa permite revisar y registrar recepciones; aún no calcula compras anticipadas."
            : ""),
      });
    }
  }
  return result;
}
