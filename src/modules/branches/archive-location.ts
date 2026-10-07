import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { locations, branchProducts } from "@/db/branch-schema";
import { locationStockBalances } from "@/db/stock-schema";
import { stockTransfers } from "@/db/transfer-schema";
import { productionOrders } from "@/db/production-order-schema";
import { preparationStations } from "@/db/preparation-schema";
import { requireOperationalContext } from "./context";

/** Archives an empty location without deleting its identity or history. */
export async function archiveLocation(
  db: AppDb,
  actor: Actor,
  branchId: string,
  id: string,
  revision: number,
) {
  return db.transaction(async (tx) => {
    const ctx = await requireOperationalContext(tx, actor, branchId);
    if (ctx.role === "staff")
      throw new AppError("FORBIDDEN", "Se requiere permiso de encargado.", 403);
    const [location] = await tx
      .select()
      .from(locations)
      .where(and(eq(locations.id, id), eq(locations.branchId, branchId)))
      .for("update");
    if (!location || location.archivedAt || location.revision !== revision)
      throw new AppError("CONFLICT", "La ubicación cambió.", 409);
    const balances = await tx
      .select()
      .from(locationStockBalances)
      .where(
        and(
          eq(locationStockBalances.locationId, id),
          sql`(${locationStockBalances.quantity}<>0 or ${locationStockBalances.reserved}<>0)`,
        ),
      )
      .limit(1);
    const transfers = await tx
      .select()
      .from(stockTransfers)
      .where(
        and(
          or(
            eq(stockTransfers.originLocationId, id),
            eq(stockTransfers.destinationLocationId, id),
          ),
          inArray(stockTransfers.state, ["confirmed", "in_transit"]),
        ),
      )
      .limit(1);
    const production = await tx
      .select()
      .from(productionOrders)
      .where(
        and(
          eq(productionOrders.locationId, id),
          eq(productionOrders.state, "confirmed"),
        ),
      )
      .limit(1);
    const stations = await tx
      .select()
      .from(preparationStations)
      .where(
        and(
          eq(preparationStations.consumptionLocationId, id),
          isNull(preparationStations.archivedAt),
        ),
      )
      .limit(1);
    const products = await tx
      .select()
      .from(branchProducts)
      .where(
        and(
          eq(branchProducts.dispatchLocationId, id),
          eq(branchProducts.enabled, true),
        ),
      )
      .limit(1);
    if (
      [balances, transfers, production, stations, products].some(
        (rows) => rows.length,
      )
    )
      throw new AppError(
        "LOCATION_NOT_EMPTY",
        "Resolvé existencias, operaciones y puntos de despacho/preparación antes de archivar.",
        409,
      );
    await tx
      .update(locations)
      .set({ archivedAt: new Date(), revision: revision + 1 })
      .where(eq(locations.id, id));
    return { id, revision: revision + 1 };
  });
}
