import { integer, safeQuantity, six } from "../inventory/decimal";
import type { ReplenishmentSnapshot } from "../replenishment/types";
import type { dailyOperationTasks } from "@/db/daily-operation-schema";
export function buildDailySuggestions(
  snapshot: ReplenishmentSnapshot,
  preparationYields: Map<string, string>,
  committed: Map<string, bigint>,
  depot?: { id: string; name: string } | null,
) {
  const result: (typeof dailyOperationTasks.$inferInsert)[] = [];
  const centralNeeds = new Map<
    string,
    {
      itemName: string;
      unit: string;
      consumers: bigint;
      own: bigint;
      destinations: Set<string>;
    }
  >();
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
      if (preparationYields.has(a.itemId)) {
        const need = centralNeeds.get(a.itemId) ?? {
          itemName: a.itemName,
          unit: a.baseUnit,
          consumers: 0n,
          own: 0n,
          destinations: new Set<string>(),
        };
        if (a.locationId === depot?.id) need.own += remaining;
        else {
          need.consumers += remaining;
          need.destinations.add(a.locationName);
        }
        centralNeeds.set(a.itemId, need);
        continue;
      }
      result.push({
        ...common,
        kind: "purchase",
        title: `Revisar compra de ${a.itemName}`,
        quantity: six(remaining),
        needKey: `${a.id}:purchase`,
        reason:
          common.reason +
          " Esta etapa permite revisar y registrar recepciones; aún no calcula compras anticipadas.",
      });
    }
  }
  for (const [itemId, need] of centralNeeds) {
    const retainedTarget = snapshot.policies.find(
      (p) => p.enabled && p.itemId === itemId && p.locationId === depot?.id,
    )?.targetQuantity;
    const alerts = snapshot.alerts.filter((a) => a.itemId === itemId);
    const physical =
      alerts.find((a) => a.locationId === depot?.id)?.availableQuantity ??
      alerts.flatMap((a) => a.sources).find((s) => s.locationId === depot?.id)
        ?.availableQuantity ??
      "0.000000";
    const retainedGap = retainedTarget
      ? integer(retainedTarget) -
        integer(physical) -
        result
          .filter(
            (s) =>
              s.kind === "transfer" &&
              s.itemId === itemId &&
              s.locationId === depot?.id,
          )
          .reduce((sum, s) => sum + integer(s.quantity!), 0n)
      : 0n;
    // Future output covers central retention first, then the aggregated consumer gap.
    // It must never enter the physical source budget above.
    const consumerGap =
      need.consumers > 0n
        ? need.consumers +
          (retainedGap > 0n ? retainedGap : 0n) -
          (committed.get(`${itemId}:${depot?.id}`) ?? 0n)
        : 0n;
    const quantity = consumerGap > need.own ? consumerGap : need.own;
    if (quantity <= 0n) continue;
    const batch = integer(preparationYields.get(itemId)!);
    result.push({
      branchId: "",
      itemId,
      unit: need.unit,
      kind: "production",
      urgency: "high",
      title: `Preparar ${need.itemName}`,
      locationId: depot?.id ?? null,
      state: depot ? "pending" : "blocked",
      quantity: safeQuantity(((quantity + batch - 1n) / batch) * batch),
      needKey: `preparation:${itemId}:${depot?.id ?? "unconfigured"}`,
      reason: depot
        ? `Preparar en ${depot.name}${need.destinations.size ? ` para reponer ${[...need.destinations].join(" y ")}` : ""}. El traslado se sugerirá cuando se registre el preparado terminado.`
        : "Configurá una ubicación activa con código DEPOSITO. Las preparaciones deben realizarse en Depósito antes de trasladarse.",
    });
  }
  return result;
}
