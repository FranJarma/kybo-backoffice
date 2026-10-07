import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  check,
  foreignKey,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { branches, locations } from "./branch-schema";
import { items } from "./item-schema";
import { inventoryLots } from "./inventory-schema";
import { stockOperations } from "./stock-schema";
export const stockTransfers = pgTable(
  "stock_transfers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    originBranchId: uuid("origin_branch_id")
      .notNull()
      .references(() => branches.id),
    destinationBranchId: uuid("destination_branch_id")
      .notNull()
      .references(() => branches.id),
    originLocationId: uuid("origin_location_id").notNull(),
    destinationLocationId: uuid("destination_location_id").notNull(),
    state: text("state").notNull().default("confirmed"),
    revision: integer("revision").notNull().default(1),
    reason: text("reason").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.originLocationId, t.originBranchId],
      foreignColumns: [locations.id, locations.branchId],
    }),
    foreignKey({
      columns: [t.destinationLocationId, t.destinationBranchId],
      foreignColumns: [locations.id, locations.branchId],
    }),
    check(
      "transfer_distinct_locations",
      sql`${t.originLocationId} <> ${t.destinationLocationId}`,
    ),
    check(
      "transfer_state",
      sql`${t.state} in ('confirmed','in_transit','received','resolved','cancelled')`,
    ),
  ],
);
export const transferAllocations = pgTable(
  "transfer_allocations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    transferId: uuid("transfer_id")
      .notNull()
      .references(() => stockTransfers.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => inventoryLots.id),
    quantity: numeric("quantity", { precision: 18, scale: 6 }).notNull(),
    received: numeric("received", { precision: 18, scale: 6 })
      .notNull()
      .default("0"),
    resolved: numeric("resolved", { precision: 18, scale: 6 })
      .notNull()
      .default("0"),
    dispatchValue: numeric("dispatch_value", { precision: 24, scale: 6 }),
    settledValue: numeric("settled_value", { precision: 24, scale: 6 })
      .notNull()
      .default("0"),
  },
  (t) => [
    uniqueIndex("transfer_lot").on(t.transferId, t.lotId),
    foreignKey({
      name: "transfer_lot_item",
      columns: [t.lotId, t.itemId],
      foreignColumns: [inventoryLots.id, inventoryLots.itemId],
    }),
    check(
      "transfer_value_conservation",
      sql`${t.settledValue}>=0 and (${t.dispatchValue} is null and ${t.settledValue}=0 or ${t.dispatchValue}>=${t.settledValue}) and (${t.received}+${t.resolved}<${t.quantity} or ${t.dispatchValue} is null or ${t.settledValue}=${t.dispatchValue})`,
    ),
    check(
      "transfer_allocation_quantities",
      sql`${t.quantity}>0 and ${t.received}>=0 and ${t.resolved}>=0 and ${t.received}+${t.resolved}<=${t.quantity}`,
    ),
  ],
);
export const transferResolutions = pgTable(
  "transfer_resolutions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    operationId: uuid("operation_id")
      .notNull()
      .references(() => stockOperations.id),
    allocationId: uuid("allocation_id")
      .notNull()
      .references(() => transferAllocations.id),
    kind: text("kind").notNull(),
    quantity: numeric("quantity", { precision: 18, scale: 6 }).notNull(),
    value: numeric("value", { precision: 24, scale: 6 }),
    reason: text("reason").notNull(),
  },
  (t) => [
    check("transfer_resolution_kind", sql`${t.kind} in ('loss','return')`),
    check(
      "transfer_resolution_quantity",
      sql`${t.quantity}>0 and (${t.value} is null or ${t.value}>=0)`,
    ),
  ],
);
