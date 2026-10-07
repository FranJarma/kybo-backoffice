import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  text,
  numeric,
  integer,
  boolean,
  timestamp,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";
export const items = pgTable(
  "items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 64 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    class: text("class").notNull(),
    baseUnit: text("base_unit").notNull(),
    unitCost: numeric("unit_cost", { precision: 18, scale: 6 }),
    purchasable: boolean("purchasable").notNull(),
    recipeUsable: boolean("recipe_usable").notNull(),
    revision: integer("revision").notNull().default(1),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("item_code_unique").on(t.code),
    check("item_code_valid", sql`${t.code} ~ '^[A-Z0-9][A-Z0-9._-]*$'`),
    check(
      "item_class_valid",
      sql`${t.class} in ('food','beverage','packaging','cleaning','other','unclassified')`,
    ),
    check("item_unit_valid", sql`${t.baseUnit} in ('g','ml','unit')`),
    check(
      "item_cost_nonnegative",
      sql`${t.unitCost} is null or ${t.unitCost} >= 0`,
    ),
    check(
      "item_recipe_safe",
      sql`${t.class} not in ('cleaning','unclassified') or not ${t.recipeUsable}`,
    ),
  ],
);
