import { and, asc, count, eq, ilike, sql } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import { items } from "@/db/item-schema";
import { inventoryLots } from "@/db/inventory-schema";
import { locations } from "@/db/branch-schema";

import { inventoryValuations, lotLocationBalances } from "@/db/stock-schema";

import type { OperationalContext } from "../operations/types";
import { businessDate } from "../operations/business-date";
import { integer, six, SCALE, roundedDivision } from "./decimal";
import { availableQuantity } from "./availability";
import { AppError } from "@/lib/errors";
import type { StockResult, LotRow, MovementRow } from "./types";
export async function stockByBranch(
  db: AppDb,
  ctx: OperationalContext,
  search: string,
  now: Date,
): Promise<StockResult> {
  return db.transaction(
    async (tx) => {
      const today = businessDate(now, ctx.timeZone);
      const filter = search.trim()
        ? ilike(
            items.name,
            `%${search
              .trim()
              .slice(0, 160)
              .replace(/[\\%_]/g, "\\$&")}%`,
          )
        : undefined;
      const catalog = await tx
        .select({ item: items, valuation: inventoryValuations })
        .from(items)
        .leftJoin(
          inventoryValuations,
          and(
            eq(inventoryValuations.itemId, items.id),
            eq(inventoryValuations.branchId, ctx.branchId),
          ),
        )
        .where(filter)
        .orderBy(items.name, items.id)
        .limit(100);
      const [{ total }] = await tx
        .select({ total: count() })
        .from(items)
        .where(filter);
      const rows = [];
      for (const { item, valuation } of catalog) {
        const lots = await tx
          .select({ lot: inventoryLots, balance: lotLocationBalances })
          .from(lotLocationBalances)
          .innerJoin(
            inventoryLots,
            eq(inventoryLots.id, lotLocationBalances.lotId),
          )
          .where(
            and(
              eq(lotLocationBalances.branchId, ctx.branchId),
              eq(inventoryLots.itemId, item.id),
            ),
          );
        let physical = 0n,
          available = 0n,
          expired = 0n,
          blocked = 0n,
          undated = 0n;
        for (const { lot, balance } of lots) {
          const q = integer(balance.quantity);
          physical += q;
          if (lot.expiresOn !== null && lot.expiresOn <= today) expired += q;
          if (lot.blocked || balance.blocked) blocked += q;
          if (lot.expiresOn === null) undated += q;
          available += availableQuantity(
            {
              id: lot.id,
              receivedOn: lot.receivedOn,
              expiresOn: lot.expiresOn,
              blocked: lot.blocked,
              locationBlocked: balance.blocked,
              quantity: q,
              reserved: integer(balance.reserved),
            },
            today,
          );
        }
        const value = valuation ? valuation.value : "0.000000";
        rows.push({
          itemId: item.id,
          name: item.name,
          baseUnit: item.baseUnit,
          archived: !!item.archivedAt,
          physicalQuantity: six(physical),
          usableQuantity: six(available),
          expiredQuantity: six(expired),
          blockedQuantity: six(blocked),
          undatedQuantity: six(undated),
          stockValue: value,
          averageCost:
            value === null || physical === 0n
              ? null
              : six(roundedDivision(integer(value) * SCALE, physical)),
        });
      }
      return { rows, total, asOf: now.toISOString(), businessDate: today };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export async function scopedLot(
  db: AppDb | Tx,
  ctx: OperationalContext,
  lotId: string,
  locationId: string,
  now = new Date(),
): Promise<LotRow> {
  const [row] = await db
    .select({
      lot: inventoryLots,
      balance: lotLocationBalances,
      item: items,
      location: locations,
    })
    .from(lotLocationBalances)
    .innerJoin(inventoryLots, eq(inventoryLots.id, lotLocationBalances.lotId))
    .innerJoin(items, eq(items.id, inventoryLots.itemId))
    .innerJoin(locations, eq(locations.id, lotLocationBalances.locationId))
    .where(
      and(
        eq(lotLocationBalances.branchId, ctx.branchId),
        eq(lotLocationBalances.lotId, lotId),
        eq(lotLocationBalances.locationId, locationId),
      ),
    );
  if (!row)
    throw new AppError(
      "NOT_FOUND",
      "El lote no existe en esta ubicación.",
      404,
    );
  const { lot, item, balance, location } = row;
  return {
    id: lot.id,
    itemId: item.id,
    itemName: item.name,
    baseUnit: item.baseUnit,
    locationId,
    locationName: location.name,
    receiptId: lot.receiptId,
    receivedOn: lot.receivedOn,
    expiresOn: lot.expiresOn,
    lotCode: lot.lotCode,
    initialQuantity: lot.initialQuantity,
    remainingQuantity: balance.quantity,
    reservedQuantity: balance.reserved,
    blocked: lot.blocked || balance.blocked,
    expired:
      lot.expiresOn !== null &&
      lot.expiresOn <= businessDate(now, ctx.timeZone),
    revision: balance.revision,
    createdAt: lot.createdAt.toISOString(),
  };
}
export async function lotsByBranch(
  db: AppDb,
  ctx: OperationalContext,
  itemId: string,
  offset: number,
  now: Date,
) {
  const condition = and(
    eq(lotLocationBalances.branchId, ctx.branchId),
    eq(inventoryLots.itemId, itemId),
  );
  const rows = await db
    .select({
      lotId: inventoryLots.id,
      locationId: lotLocationBalances.locationId,
    })
    .from(lotLocationBalances)
    .innerJoin(inventoryLots, eq(inventoryLots.id, lotLocationBalances.lotId))
    .where(condition)
    .orderBy(
      asc(inventoryLots.expiresOn),
      asc(inventoryLots.id),
      asc(lotLocationBalances.locationId),
    )
    .limit(100)
    .offset(offset);
  const [{ total }] = await db
    .select({ total: count() })
    .from(lotLocationBalances)
    .innerJoin(inventoryLots, eq(inventoryLots.id, lotLocationBalances.lotId))
    .where(condition);
  return {
    rows: await Promise.all(
      rows.map((r) => scopedLot(db, ctx, r.lotId, r.locationId, now)),
    ),
    total,
  };
}
export async function movementsByBranch(
  db: AppDb,
  ctx: OperationalContext,
  itemId: string,
  offset: number,
): Promise<{ rows: MovementRow[]; total: number }> {
  const history = sql`
    select m.id,m.lot_id as "lotId",m.item_id as "itemId",m.action as kind,m.quantity::text as delta,
      (abs(m.value)/abs(m.quantity))::numeric(24,6)::text as "unitCost",m.value::text as "valueDelta",
      m.reason,m.document_id as "referenceId",u.name as "actorName",m.created_at as "createdAt"
    from stock_movements m join stock_operations o on o.id=m.operation_id join "user" u on u.id=o.actor_id
    where m.branch_id=${ctx.branchId} and m.item_id=${itemId}
    union all
    select m.id,m.lot_id,m.item_id,m.kind,m.delta::text,m.unit_cost::text,m.value_delta::text,m.reason,m.reference_id,m.actor_name,m.created_at
    from inventory_movements m where m.item_id=${itemId} and exists (
      select 1 from stock_transition_baselines b join locations l on l.id=b.location_id
      where b.item_id=m.item_id and l.branch_id=${ctx.branchId}
    )`;
  const result = await db.execute(
    sql`select * from (${history}) history order by "createdAt" desc,id desc limit 100 offset ${offset}`,
  );
  const counts = await db.execute(
    sql`select count(*)::int as total from (${history}) history`,
  );
  return {
    total: Number(counts.rows[0].total),
    rows: result.rows.map((row) => ({
      ...row,
      createdAt:
        row.createdAt instanceof Date
          ? row.createdAt.toISOString()
          : String(row.createdAt),
    })) as MovementRow[],
  };
}
