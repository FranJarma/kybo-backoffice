export { saveSupplyPolicy } from "./policies";
import { and, eq, inArray, isNull } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import type { Actor } from "@/lib/access";
import type { OperationalContext } from "../operations/types";
import { supplyAlertPolicies as policies } from "@/db/supply-alert-schema";
import { items } from "@/db/item-schema";
import { locations } from "@/db/branch-schema";
import { inventoryLots } from "@/db/inventory-schema";
import { lotLocationBalances } from "@/db/stock-schema";
import { stockTransfers, transferAllocations } from "@/db/transfer-schema";
import { requireOperationalContext } from "../branches/context";
import { AppError } from "@/lib/errors";
import { integer, safeQuantity } from "../inventory/decimal";
import { availableQuantity } from "../inventory/availability";
import { businessDate } from "../operations/business-date";
import { supplyAvailable } from "./policies";
import { projectSupply } from "./engine";
import type { SupplySnapshot } from "./types";
import { pendingPurchaseSupply } from "../procurement/queries";
export async function getSupplySnapshot(
  db: AppDb,
  actor: Actor,
  now = new Date(),
) {
  const ctx = await requireOperationalContext(db, actor, actor.branchId ?? "");
  if (ctx.role === "staff")
    throw new AppError(
      "FORBIDDEN",
      "Solo el encargado puede consultar la configuración de compras.",
      403,
    );
  return db.transaction((tx) => readSupplySnapshot(tx, ctx, now, true), {
    isolationLevel: "repeatable read",
    accessMode: "read only",
  });
}
export async function readSupplySnapshot(
  tx: Tx,
  ctx: OperationalContext,
  now: Date,
  catalog = false,
): Promise<SupplySnapshot> {
  const base = { asOf: now.toISOString(), policies: [], alerts: [], items: [] };
  if (!(await supplyAvailable(tx))) return { ...base, available: false };
  const rows = await tx
    .select({
      id: policies.id,
      revision: policies.revision,
      itemId: items.id,
      itemName: items.name,
      baseUnit: items.baseUnit,
      dailyConsumption: policies.dailyConsumption,
      leadDays: policies.leadDays,
      safetyDays: policies.safetyDays,
      targetDays: policies.targetDays,
      enabled: policies.enabled,
    })
    .from(policies)
    .innerJoin(items, eq(items.id, policies.itemId))
    .where(
      and(
        eq(policies.branchId, ctx.branchId),
        eq(items.stockTracked, true),
        eq(items.purchasable, true),
        isNull(items.archivedAt),
      ),
    );
  const availableItems = catalog
    ? await tx
        .select({ id: items.id, name: items.name, baseUnit: items.baseUnit })
        .from(items)
        .where(
          and(
            eq(items.stockTracked, true),
            eq(items.purchasable, true),
            isNull(items.archivedAt),
          ),
        )
    : [];
  const ids = rows.filter((p) => p.enabled).map((p) => p.itemId);
  if (!ids.length)
    return { ...base, available: true, policies: rows, items: availableItems };
  const lots = await tx
    .select({ lot: inventoryLots, balance: lotLocationBalances })
    .from(lotLocationBalances)
    .innerJoin(inventoryLots, eq(inventoryLots.id, lotLocationBalances.lotId))
    .innerJoin(locations, eq(locations.id, lotLocationBalances.locationId))
    .where(
      and(
        eq(lotLocationBalances.branchId, ctx.branchId),
        eq(locations.branchId, ctx.branchId),
        isNull(locations.archivedAt),
        inArray(inventoryLots.itemId, ids),
      ),
    );
  // An internal reservation is still physically inside this branch. Recredit it
  // only while the transfer is confirmed and its destination remains active.
  const internal = await tx
    .select({
      allocation: transferAllocations,
      origin: stockTransfers.originLocationId,
    })
    .from(transferAllocations)
    .innerJoin(
      stockTransfers,
      eq(stockTransfers.id, transferAllocations.transferId),
    )
    .innerJoin(
      locations,
      eq(locations.id, stockTransfers.destinationLocationId),
    )
    .where(
      and(
        eq(stockTransfers.originBranchId, ctx.branchId),
        eq(stockTransfers.destinationBranchId, ctx.branchId),
        eq(stockTransfers.state, "confirmed"),
        isNull(locations.archivedAt),
        inArray(transferAllocations.itemId, ids),
      ),
    );
  const reserved = new Map<string, bigint>();
  for (const { allocation: a, origin } of internal) {
    const key = `${a.lotId}:${origin}`;
    reserved.set(
      key,
      (reserved.get(key) ?? 0n) +
        integer(a.quantity) -
        integer(a.received) -
        integer(a.resolved),
    );
  }
  const today = businessDate(now, ctx.timeZone);
  const pending = await pendingPurchaseSupply(tx, ctx.branchId);
  const eligible = lots.map(({ lot, balance }) => {
    const id = `${lot.id}:${balance.locationId}`;
    const held = integer(balance.reserved),
      internalHeld = reserved.get(id) ?? 0n;
    const usable =
      !lot.blocked &&
      !balance.blocked &&
      (!lot.expiresOn || lot.expiresOn > today);
    return {
      itemId: lot.itemId,
      id,
      expiresOn: lot.expiresOn,
      quantity: safeQuantity(
        availableQuantity(
          {
            ...lot,
            locationBlocked: balance.blocked,
            quantity: integer(balance.quantity),
            reserved: held,
          },
          today,
        ) + (usable ? (internalHeld < held ? internalHeld : held) : 0n),
      ),
    };
  });
  return {
    available: true,
    asOf: now.toISOString(),
    policies: rows,
    items: availableItems,
    alerts: rows
      .filter((p) => p.enabled)
      .map((p) =>
        projectSupply(
          p,
          eligible.filter((l) => l.itemId === p.itemId),
          today,
          pending.filter((i) => i.itemId === p.itemId),
        ),
      ),
  };
}
