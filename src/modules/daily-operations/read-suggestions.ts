import { and, eq, inArray } from "drizzle-orm";
import type { Tx } from "@/db/types";
import type { OperationalContext } from "../operations/types";
import { productionOrders } from "@/db/production-order-schema";
import { stockTransfers, transferAllocations } from "@/db/transfer-schema";
import { integer } from "../inventory/decimal";
import { readReplenishmentSnapshot } from "../replenishment/service";
import {
  centralPreparationLocation,
  currentPreparationRecipes,
} from "./central-preparation";
import { buildDailySuggestions } from "./suggestions";

/** Shared by reconciliation and confirmation so a stale task cannot ignore newer supply. */
export async function readDailySuggestions(tx: Tx, ctx: OperationalContext) {
  const snapshot = await readReplenishmentSnapshot(tx, ctx, new Date());
  const prep = await currentPreparationRecipes(tx);
  const depot = await centralPreparationLocation(tx, ctx.branchId);
  const orders = await tx
    .select()
    .from(productionOrders)
    .where(
      and(
        eq(productionOrders.branchId, ctx.branchId),
        inArray(productionOrders.state, ["planned", "confirmed"]),
      ),
    );
  const incoming = await tx
    .select({
      itemId: transferAllocations.itemId,
      locationId: stockTransfers.destinationLocationId,
      quantity: transferAllocations.quantity,
    })
    .from(transferAllocations)
    .innerJoin(
      stockTransfers,
      eq(stockTransfers.id, transferAllocations.transferId),
    )
    .where(
      and(
        eq(stockTransfers.originBranchId, ctx.branchId),
        eq(stockTransfers.destinationBranchId, ctx.branchId),
        eq(stockTransfers.state, "confirmed"),
      ),
    );
  const committed = new Map<string, bigint>();
  for (const row of [
    ...orders.map((o) => ({
      itemId: o.outputItemId,
      locationId: o.locationId,
      quantity: o.plannedQuantity,
    })),
    ...incoming,
  ]) {
    const key = `${row.itemId}:${row.locationId}`;
    committed.set(key, (committed.get(key) ?? 0n) + integer(row.quantity));
  }
  return buildDailySuggestions(
    snapshot,
    new Map(
      prep.flatMap((p) =>
        p.itemId ? [[p.itemId, p.yieldQuantity] as const] : [],
      ),
    ),
    committed,
    depot,
  );
}
