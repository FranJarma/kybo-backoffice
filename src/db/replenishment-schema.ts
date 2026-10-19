import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  foreignKey,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { branches, locations } from "./branch-schema";
import { items } from "./item-schema";
import { user } from "./auth-schema";

export const replenishmentPolicies = pgTable(
  "replenishment_policies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    locationId: uuid("location_id").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id),
    minimumQuantity: numeric("minimum_quantity", {
      precision: 18,
      scale: 6,
    }).notNull(),
    targetQuantity: numeric("target_quantity", {
      precision: 18,
      scale: 6,
    }).notNull(),
    preparationMinutes: integer("preparation_minutes"),
    enabled: boolean("enabled").notNull().default(true),
    revision: integer("revision").notNull().default(1),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("replenishment_location_item").on(
      t.branchId,
      t.locationId,
      t.itemId,
    ),
    foreignKey({
      name: "replenishment_location_branch",
      columns: [t.locationId, t.branchId],
      foreignColumns: [locations.id, locations.branchId],
    }),
    check(
      "replenishment_quantities",
      sql`${t.minimumQuantity} >= 0 and ${t.targetQuantity} > 0 and ${t.targetQuantity} >= ${t.minimumQuantity} and (not ${t.enabled} or ${t.targetQuantity} > ${t.minimumQuantity})`,
    ),
    check(
      "replenishment_minutes",
      sql`${t.preparationMinutes} is null or ${t.preparationMinutes} between 1 and 10080`,
    ),
    check("replenishment_revision", sql`${t.revision} > 0`),
  ],
);
