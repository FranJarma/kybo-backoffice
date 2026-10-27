import { and, asc, eq, inArray, or } from "drizzle-orm";
import type { Tx } from "@/db/types";
import { items } from "@/db/item-schema";
import { locations } from "@/db/branch-schema";
import { inventoryValuations, locationStockBalances } from "@/db/stock-schema";
import type { OperationalContext } from "../operations/types";
import { AppError } from "@/lib/errors";
export async function lockStock(
  tx: Tx,
  ctx: OperationalContext,
  pairs: { itemId: string; locationId: string }[],
  allowArchived = false,
) {
  const ordered = [
    ...new Map(pairs.map((p) => [`${p.itemId}/${p.locationId}`, p])).values(),
  ].sort(
    (a, b) =>
      a.itemId.localeCompare(b.itemId) ||
      a.locationId.localeCompare(b.locationId),
  );
  if (!ordered.length) return new Set<string>();
  const itemIds = [...new Set(ordered.map((p) => p.itemId))];
  const stockItems = await tx
    .select()
    .from(items)
    .where(inArray(items.id, itemIds))
    .orderBy(asc(items.id))
    .for("update");
  const tracked = new Set<string>();
  for (const id of itemIds) {
    const item = stockItems.find((i) => i.id === id);
    if (
      !item ||
      (!allowArchived && (item.archivedAt || item.class === "unclassified"))
    )
      throw new AppError(
        "ITEM_UNAVAILABLE",
        "El artículo no está disponible o necesita clasificación.",
        409,
      );
    if (item.stockTracked) tracked.add(id);
  }
  if (tracked.size) {
    await tx
      .insert(inventoryValuations)
      .values(
        [...tracked].map((id) => ({
          itemId: id,
          branchId: ctx.branchId,
          quantity: "0.000000",
          value: "0.000000",
        })),
      )
      .onConflictDoNothing();
    await tx
      .select()
      .from(inventoryValuations)
      .where(
        and(
          inArray(inventoryValuations.itemId, [...tracked]),
          eq(inventoryValuations.branchId, ctx.branchId),
        ),
      )
      .orderBy(asc(inventoryValuations.itemId))
      .for("update");
  }
  const locationIds = [...new Set(ordered.map((p) => p.locationId))].sort();
  const selectedLocations = await tx
    .select()
    .from(locations)
    .where(
      and(
        inArray(locations.id, locationIds),
        eq(locations.branchId, ctx.branchId),
      ),
    )
    .orderBy(asc(locations.id))
    .for("share");
  for (const id of locationIds) {
    const location = selectedLocations.find((l) => l.id === id);
    if (!location || (!allowArchived && location.archivedAt))
      throw new AppError(
        "LOCATION_UNAVAILABLE",
        "La ubicación no pertenece a esta sucursal o está archivada.",
        409,
      );
  }
  const trackedPairs = ordered.filter((p) => tracked.has(p.itemId));
  if (trackedPairs.length) {
    await tx
      .insert(locationStockBalances)
      .values(
        trackedPairs.map((pair) => ({
          itemId: pair.itemId,
          locationId: pair.locationId,
          branchId: ctx.branchId,
        })),
      )
      .onConflictDoNothing();
    await tx
      .select()
      .from(locationStockBalances)
      .where(
        and(
          eq(locationStockBalances.branchId, ctx.branchId),
          or(
            ...trackedPairs.map((pair) =>
              and(
                eq(locationStockBalances.itemId, pair.itemId),
                eq(locationStockBalances.locationId, pair.locationId),
              ),
            ),
          ),
        ),
      )
      .orderBy(
        asc(locationStockBalances.itemId),
        asc(locationStockBalances.locationId),
      )
      .for("update");
  }
  return tracked;
}
