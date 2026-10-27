import type { SupplyAlert } from "./types";

export type PurchaseSeed = {
  itemId: string;
  itemName: string;
  baseUnit: string;
  quantity: string;
  leadDays: number;
};

export function purchaseAlerts(alerts: SupplyAlert[]) {
  const rank = { critical: 0, high: 1, scheduled: 2 };
  return alerts
    .filter((a) => a.enabled)
    .sort(
      (a, b) =>
        (a.urgency ? rank[a.urgency] : 3) - (b.urgency ? rank[b.urgency] : 3) ||
        (a.orderBy ?? "9999").localeCompare(b.orderBy ?? "9999") ||
        a.itemName.localeCompare(b.itemName),
    );
}

export function purchaseSeed(alerts: SupplyAlert[]): PurchaseSeed[] {
  return purchaseAlerts(alerts)
    .filter((a) => a.status === "action" && Number(a.suggestedQuantity) > 0)
    .map((a) => ({
      itemId: a.itemId,
      itemName: a.itemName,
      baseUnit: a.baseUnit,
      quantity: a.suggestedQuantity,
      leadDays: a.leadDays,
    }));
}

export function purchaseTiming(orderBy: string | null, today: string) {
  if (!orderBy) return "Revisar consumo";
  if (orderBy < today) return "Pedir cuanto antes";
  if (orderBy === today) return "Pedir hoy";
  return `Pedir el ${orderBy.slice(8, 10)}/${orderBy.slice(5, 7)}`;
}
