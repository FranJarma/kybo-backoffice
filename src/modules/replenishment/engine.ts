import { availableQuantity } from "@/modules/inventory/availability";
import { integer, six } from "@/modules/inventory/decimal";
import type { ReplenishmentAlert, ReplenishmentPolicy } from "./types";

export type ReplenishmentLot = {
  id: string;
  itemId: string;
  locationId: string;
  locationName: string;
  receivedOn: string;
  expiresOn: string | null;
  blocked: boolean;
  locationBlocked: boolean;
  quantity: string;
  reserved: string;
};
export type ActiveReplenishmentProduction =
  ReplenishmentAlert["activeProduction"][number] & {
    itemId: string;
    locationId: string;
  };

/** Pure snapshot calculation: no writes and no expected production added to stock. */
export function buildReplenishmentAlerts(input: {
  policies: ReplenishmentPolicy[];
  lots: ReplenishmentLot[];
  preparationItemIds: string[];
  activeProduction: ActiveReplenishmentProduction[];
  today: string;
}): ReplenishmentAlert[] {
  const stock = new Map<
    string,
    Map<string, { name: string; quantity: bigint }>
  >();
  for (const lot of input.lots) {
    const locations = stock.get(lot.itemId) ?? new Map();
    const current = locations.get(lot.locationId)?.quantity ?? 0n;
    locations.set(lot.locationId, {
      name: lot.locationName,
      quantity:
        current +
        availableQuantity(
          {
            ...lot,
            quantity: integer(lot.quantity),
            reserved: integer(lot.reserved),
          },
          input.today,
        ),
    });
    stock.set(lot.itemId, locations);
  }
  const preparation = new Set(input.preparationItemIds);
  const orders = new Map<string, ReplenishmentAlert["activeProduction"]>();
  for (const order of input.activeProduction) {
    if (order.state !== "planned" && order.state !== "confirmed") continue;
    const key = `${order.itemId}:${order.locationId}`;
    const current = orders.get(key) ?? [];
    current.push({
      id: order.id,
      plannedQuantity: order.plannedQuantity,
      state: order.state,
      assignedToName: order.assignedToName,
      startedAt: order.startedAt ?? null,
    });
    orders.set(key, current);
  }
  const alerts: ReplenishmentAlert[] = [];
  for (const policy of input.policies) {
    if (!policy.enabled) continue;
    const locations = stock.get(policy.itemId);
    const available = locations?.get(policy.locationId)?.quantity ?? 0n;
    if (available > integer(policy.minimumQuantity)) continue;
    const sources = [...(locations?.entries() ?? [])]
      .filter(([id, value]) => id !== policy.locationId && value.quantity > 0n)
      .map(([locationId, value]) => ({
        locationId,
        locationName: value.name,
        availableQuantity: six(value.quantity),
      }));
    const shortfall = integer(policy.targetQuantity) - available;
    const sourceTotal = sources.reduce(
      (sum, source) => sum + integer(source.availableQuantity),
      0n,
    );
    const suggested =
      sources.length && sourceTotal < shortfall ? sourceTotal : shortfall;
    alerts.push({
      id: policy.id,
      itemId: policy.itemId,
      itemName: policy.itemName,
      baseUnit: policy.baseUnit,
      locationId: policy.locationId,
      locationName: policy.locationName,
      minimumQuantity: policy.minimumQuantity,
      targetQuantity: policy.targetQuantity,
      preparationMinutes: policy.preparationMinutes,
      kind: sources.length
        ? "transfer"
        : preparation.has(policy.itemId)
          ? "production"
          : "purchase",
      severity: available === 0n ? "empty" : "low",
      availableQuantity: six(available),
      suggestedQuantity: six(suggested),
      sources,
      activeProduction:
        orders.get(`${policy.itemId}:${policy.locationId}`) ?? [],
    });
  }
  return alerts.sort(
    (a, b) =>
      (a.severity === b.severity ? 0 : a.severity === "empty" ? -1 : 1) ||
      a.locationName.localeCompare(b.locationName) ||
      a.itemName.localeCompare(b.itemName),
  );
}
