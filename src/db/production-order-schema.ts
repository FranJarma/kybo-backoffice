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
  jsonb,
} from "drizzle-orm/pg-core";
import { branches, locations } from "./branch-schema";
import { items } from "./item-schema";
import { recipeVersions } from "./recipe-schema";
export const productionOrders = pgTable(
  "production_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    locationId: uuid("location_id").notNull(),
    recipeVersionId: uuid("recipe_version_id")
      .notNull()
      .references(() => recipeVersions.id),
    outputItemId: uuid("output_item_id")
      .notNull()
      .references(() => items.id),
    plannedQuantity: numeric("planned_quantity", {
      precision: 18,
      scale: 6,
    }).notNull(),
    actualQuantity: numeric("actual_quantity", { precision: 18, scale: 6 }),
    composition: jsonb("composition").notNull(),
    state: text("state").notNull().default("confirmed"),
    revision: integer("revision").notNull().default(1),
  },
  (t) => [
    uniqueIndex("production_order_branch").on(t.id, t.branchId),
    foreignKey({
      columns: [t.locationId, t.branchId],
      foreignColumns: [locations.id, locations.branchId],
    }),
    check(
      "production_order_state",
      sql`${t.state} in ('confirmed','completed','cancelled')`,
    ),
    check(
      "production_order_quantities",
      sql`${t.plannedQuantity}>0 and (${t.actualQuantity} is null or ${t.actualQuantity}>0)`,
    ),
  ],
);
