import { and, eq } from "drizzle-orm";
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
  for (const id of [...new Set(ordered.map((p) => p.itemId))]) {
    const [item] = await tx
      .select()
      .from(items)
      .where(eq(items.id, id))
      .for("update");
    if (
      !item ||
      (!allowArchived && (item.archivedAt || item.class === "unclassified"))
    )
      throw new AppError(
        "ITEM_UNAVAILABLE",
        "El artículo no está disponible o necesita clasificación.",
        409,
      );
  }
  for (const id of [...new Set(ordered.map((p) => p.itemId))]) {
    await tx
      .insert(inventoryValuations)
      .values({
        itemId: id,
        branchId: ctx.branchId,
        quantity: "0.000000",
        value: "0.000000",
      })
      .onConflictDoNothing();
    await tx
      .select()
      .from(inventoryValuations)
      .where(
        and(
          eq(inventoryValuations.itemId, id),
          eq(inventoryValuations.branchId, ctx.branchId),
        ),
      )
      .for("update");
  }
  for (const pair of ordered) {
    const [location] = await tx
      .select()
      .from(locations)
      .where(
        and(
          eq(locations.id, pair.locationId),
          eq(locations.branchId, ctx.branchId),
        ),
      )
      .for("share");
    if (!location || (!allowArchived && location.archivedAt))
      throw new AppError(
        "LOCATION_UNAVAILABLE",
        "La ubicación no pertenece a esta sucursal o está archivada.",
        409,
      );
    await tx
      .insert(locationStockBalances)
      .values({ ...pair, branchId: ctx.branchId })
      .onConflictDoNothing();
    await tx
      .select()
      .from(locationStockBalances)
      .where(
        and(
          eq(locationStockBalances.itemId, pair.itemId),
          eq(locationStockBalances.locationId, pair.locationId),
        ),
      )
      .for("update");
  }
}
