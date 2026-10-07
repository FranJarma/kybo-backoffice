import { sql } from "drizzle-orm";
import {
  pgTable,
  integer,
  uuid,
  text,
  timestamp,
  numeric,
  primaryKey,
  check,
} from "drizzle-orm/pg-core";
import { items } from "./item-schema";
import { locations } from "./branch-schema";
import { inventoryLots } from "./inventory-schema";
export const dataModelState = pgTable(
  "data_model_state",
  {
    id: integer("id").primaryKey(),
    status: text("status").notNull(),
    cutoverAt: timestamp("cutover_at", { withTimezone: true }).notNull(),
    mappingHash: text("mapping_hash").notNull(),
  },
  (t) => [
    check("data_model_singleton", sql`${t.id}=1`),
    check("data_model_status", sql`${t.status} in ('transitioning','ready')`),
  ],
);
export const stockTransitionBaselines = pgTable(
  "stock_transition_baselines",
  {
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    quantity: numeric("quantity", { precision: 18, scale: 6 }).notNull(),
    value: numeric("value", { precision: 24, scale: 6 }),
  },
  (t) => [
    primaryKey({ columns: [t.itemId, t.locationId] }),
    check(
      "stock_baseline_nonnegative",
      sql`${t.quantity}>=0 and (${t.value} is null or ${t.value}>=0)`,
    ),
  ],
);
export const lotTransitionBaselines = pgTable(
  "lot_transition_baselines",
  {
    lotId: uuid("lot_id")
      .notNull()
      .references(() => inventoryLots.id),
    locationId: uuid("location_id")
      .notNull()
      .references(() => locations.id),
    quantity: numeric("quantity", { precision: 18, scale: 6 }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.lotId, t.locationId] }),
    check("lot_baseline_nonnegative", sql`${t.quantity}>=0`),
  ],
);
