import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  date,
  timestamp,
  check,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { ingredients } from "./business-schema";
import { user } from "./auth-schema";
import { inventoryLots } from "./inventory-schema";
import { recipeVersions, recipeLines, recipeOptions } from "./recipe-schema";
const quantity = (n: string) => numeric(n, { precision: 18, scale: 6 });
const value = (n: string) => numeric(n, { precision: 24, scale: 6 });
export const productionBatches = pgTable(
  "production_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recipeVersionId: uuid("recipe_version_id")
      .notNull()
      .references(() => recipeVersions.id, { onDelete: "restrict" }),
    outputIngredientId: uuid("output_ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "restrict" }),
    outputName: text("output_name").notNull(),
    baseUnit: text("base_unit").notNull(),
    outputLotId: uuid("output_lot_id")
      .notNull()
      .references(() => inventoryLots.id, { onDelete: "restrict" }),
    multiplier: quantity("multiplier").notNull(),
    expectedOutput: quantity("expected_output").notNull(),
    actualOutput: quantity("actual_output").notNull(),
    totalCost: value("total_cost"),
    unitCost: value("unit_cost"),
    producedOn: date("produced_on").notNull(),
    expiresOn: date("expires_on"),
    lotCode: text("lot_code"),
    notes: text("notes"),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    actorName: text("actor_name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("production_recent").on(t.createdAt),
    uniqueIndex("production_output_lot").on(t.outputLotId),
    check(
      "production_positive",
      sql`${t.multiplier} > 0 and ${t.expectedOutput} > 0 and ${t.actualOutput} > 0`,
    ),
    check(
      "production_cost_valid",
      sql`(${t.totalCost} is null or ${t.totalCost} >= 0) and (${t.unitCost} is null or ${t.unitCost} >= 0)`,
    ),
  ],
);
export const productionSelections = pgTable(
  "production_selections",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => productionBatches.id, { onDelete: "restrict" }),
    lineId: uuid("line_id")
      .notNull()
      .references(() => recipeLines.id, { onDelete: "restrict" }),
    optionId: uuid("option_id").references(() => recipeOptions.id, {
      onDelete: "restrict",
    }),
    quantity: quantity("quantity").notNull(),
  },
  (t) => [
    uniqueIndex("production_selected_line").on(t.batchId, t.lineId),
    check(
      "production_selection_quantity",
      sql`(${t.optionId} is null and ${t.quantity} = 0) or (${t.optionId} is not null and ${t.quantity} > 0)`,
    ),
  ],
);
export const productionAllocations = pgTable(
  "production_allocations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id")
      .notNull()
      .references(() => productionBatches.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "restrict" }),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => inventoryLots.id, { onDelete: "restrict" }),
    ingredientName: text("ingredient_name").notNull(),
    baseUnit: text("base_unit").notNull(),
    quantity: quantity("quantity").notNull(),
    totalCost: value("total_cost"),
    unitCost: value("unit_cost"),
  },
  (t) => [
    uniqueIndex("production_allocation_position").on(t.batchId, t.position),
    check("production_allocation_positive", sql`${t.quantity} > 0`),
  ],
);
