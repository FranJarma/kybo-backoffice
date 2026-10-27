import { integer, six } from "../inventory/decimal";
import type { StockRow } from "./types";

export type StockItemSummary = Omit<StockRow, "locationId" | "locationName"> & {
  locations: StockRow[];
};

/** Group before pagination so an item's stock never disappears onto another location's page. */
export function summarizeStockByItem(
  rows: StockRow[],
  locationId: string,
): StockItemSummary[] {
  const items = new Map<string, StockItemSummary>();
  for (const row of rows) {
    if (locationId && row.locationId !== locationId) continue;
    const previous = items.get(row.itemId);
    if (!previous) {
      items.set(row.itemId, {
        itemId: row.itemId,
        itemName: row.itemName,
        unit: row.unit,
        physical: row.physical,
        reserved: row.reserved,
        unusable: row.unusable,
        available: row.available,
        locations: [row],
      });
      continue;
    }
    for (const field of [
      "physical",
      "reserved",
      "unusable",
      "available",
    ] as const)
      previous[field] = six(integer(previous[field]) + integer(row[field]));
    previous.locations.push(row);
  }
  return Array.from(items.values());
}
