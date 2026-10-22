import { and, eq } from "drizzle-orm";
import type { Tx } from "@/db/types";
import { items } from "@/db/item-schema";
import { locations } from "@/db/branch-schema";
import { inventoryLots } from "@/db/inventory-schema";
import { lotLocationBalances } from "@/db/stock-schema";
import { AppError } from "@/lib/errors";
import type { OperationalContext } from "../operations/types";
import { businessDate } from "../operations/business-date";
import { convertToBase } from "../items/units";
import { availableQuantity } from "./availability";
import { integer, six } from "./decimal";

/** Caller holds the item/location locks for the whole demand. No stock is changed. */
export async function assertStockAvailable(
  tx: Tx,
  ctx: OperationalContext,
  demands: { itemId: string; locationId: string; quantity: string }[],
  tracked: Set<string>,
) {
  const grouped = new Map<
    string,
    { itemId: string; locationId: string; needed: bigint }
  >();
  for (const demand of demands) {
    if (!tracked.has(demand.itemId)) continue;
    const key = `${demand.itemId}/${demand.locationId}`;
    const needed = integer(convertToBase(demand.quantity, "unit", "unit"));
    grouped.set(key, {
      ...demand,
      needed: needed + (grouped.get(key)?.needed ?? 0n),
    });
  }
  const today = businessDate(new Date(), ctx.timeZone);
  const shortages: string[] = [];
  const format = (value: bigint) =>
    six(value)
      .replace(/\.?0+$/, "")
      .replace(".", ",");
  for (const demand of grouped.values()) {
    const lots = await tx
      .select({ lot: inventoryLots, balance: lotLocationBalances })
      .from(lotLocationBalances)
      .innerJoin(inventoryLots, eq(inventoryLots.id, lotLocationBalances.lotId))
      .where(
        and(
          eq(lotLocationBalances.branchId, ctx.branchId),
          eq(lotLocationBalances.locationId, demand.locationId),
          eq(inventoryLots.itemId, demand.itemId),
        ),
      );
    const available = lots.reduce(
      (sum, { lot, balance }) =>
        sum +
        availableQuantity(
          {
            id: lot.id,
            receivedOn: lot.receivedOn,
            expiresOn: lot.expiresOn,
            blocked: lot.blocked,
            locationBlocked: balance.blocked,
            quantity: integer(balance.quantity),
            reserved: integer(balance.reserved),
          },
          today,
        ),
      0n,
    );
    if (available >= demand.needed) continue;
    const [item] = await tx
      .select({ name: items.name, unit: items.baseUnit })
      .from(items)
      .where(eq(items.id, demand.itemId));
    const [location] = await tx
      .select({ name: locations.name })
      .from(locations)
      .where(
        and(
          eq(locations.id, demand.locationId),
          eq(locations.branchId, ctx.branchId),
        ),
      );
    const unit = item.unit === "unit" ? "unid." : item.unit;
    shortages.push(
      `• ${item.name} en ${location.name}: faltan ${format(demand.needed - available)} ${unit} (necesarios: ${format(demand.needed)}; disponibles: ${format(available)}).`,
    );
  }
  if (shortages.length)
    throw new AppError(
      "INSUFFICIENT_STOCK",
      `No hay stock disponible suficiente para reservar:\n${shortages.sort((a, b) => a.localeCompare(b, "es")).join("\n")}\nReponé los insumos en las ubicaciones indicadas y volvé a intentar.`,
      409,
    );
}
