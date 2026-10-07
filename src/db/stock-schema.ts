import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  numeric,
  boolean,
  integer,
  timestamp,
  primaryKey,
  foreignKey,
  check,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";
import { items } from "./item-schema";
import { branches, locations } from "./branch-schema";
import { inventoryLots } from "./inventory-schema";
import { user } from "./auth-schema";
const quantity = (name: string) => numeric(name, { precision: 18, scale: 6 });
const value = (name: string) => numeric(name, { precision: 24, scale: 6 });
export const stockOperations = pgTable(
  "stock_operations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    requestId: uuid("request_id").notNull(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    action: text("action").notNull(),
    fingerprint: text("fingerprint").notNull(),
    result: jsonb("result"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("stock_operation_request").on(t.requestId),
    uniqueIndex("stock_operation_branch").on(t.id, t.branchId),
  ],
);
export const locationStockBalances = pgTable(
  "location_stock_balances",
  {
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id),
    locationId: uuid("location_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    quantity: quantity("quantity").notNull().default("0"),
    reserved: quantity("reserved").notNull().default("0"),
  },
  (t) => [
    primaryKey({ columns: [t.itemId, t.locationId] }),
    foreignKey({
      columns: [t.locationId, t.branchId],
      foreignColumns: [locations.id, locations.branchId],
    }),
    check(
      "location_stock_nonnegative",
      sql`${t.quantity} >= 0 and ${t.reserved} between 0 and ${t.quantity}`,
    ),
  ],
);
export const lotLocationBalances = pgTable(
  "lot_location_balances",
  {
    lotId: uuid("lot_id")
      .notNull()
      .references(() => inventoryLots.id),
    locationId: uuid("location_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    quantity: quantity("quantity").notNull().default("0"),
    reserved: quantity("reserved").notNull().default("0"),
    blocked: boolean("blocked").notNull().default(false),
    revision: integer("revision").notNull().default(1),
  },
  (t) => [
    primaryKey({ columns: [t.lotId, t.locationId] }),
    uniqueIndex("lot_location_branch").on(t.lotId, t.locationId, t.branchId),
    foreignKey({
      columns: [t.locationId, t.branchId],
      foreignColumns: [locations.id, locations.branchId],
    }),
    check(
      "lot_location_nonnegative",
      sql`${t.quantity} >= 0 and ${t.reserved} between 0 and ${t.quantity}`,
    ),
  ],
);
export const inventoryValuations = pgTable(
  "inventory_valuations",
  {
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    quantity: quantity("quantity").notNull().default("0"),
    value: value("value"),
  },
  (t) => [
    primaryKey({ columns: [t.branchId, t.itemId] }),
    check(
      "inventory_valuation_nonnegative",
      sql`${t.quantity} >= 0 and (${t.value} is null or ${t.value} >= 0)`,
    ),
  ],
);
export const stockBlockEvents = pgTable("stock_block_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  operationId: uuid("operation_id")
    .notNull()
    .references(() => stockOperations.id),
  lotId: uuid("lot_id")
    .notNull()
    .references(() => inventoryLots.id),
  locationId: uuid("location_id")
    .notNull()
    .references(() => locations.id),
  blocked: boolean("blocked").notNull(),
  reason: text("reason").notNull(),
});
