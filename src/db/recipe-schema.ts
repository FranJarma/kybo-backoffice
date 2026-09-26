import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  numeric,
  timestamp,
  check,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { ingredients, products } from "./business-schema";
import { user } from "./auth-schema";

// One serialization point for edits to the dependency graph (including alternatives).
export const recipeGraphLock = pgTable("recipe_graph_lock", {
  id: integer("id").primaryKey(),
});
export const recipes = pgTable(
  "recipes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: text("kind").notNull(),
    productId: uuid("product_id").references(() => products.id, {
      onDelete: "restrict",
    }),
    outputIngredientId: uuid("output_ingredient_id").references(
      () => ingredients.id,
      { onDelete: "restrict" },
    ),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("recipe_product").on(t.productId),
    uniqueIndex("recipe_output").on(t.outputIngredientId),
    check(
      "recipe_target",
      sql`(${t.kind} = 'product' and ${t.productId} is not null and ${t.outputIngredientId} is null) or (${t.kind} = 'preparation' and ${t.productId} is null and ${t.outputIngredientId} is not null)`,
    ),
    check("recipe_revision_positive", sql`${t.revision} > 0`),
  ],
);
export const recipeVersions = pgTable(
  "recipe_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipes.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    outputName: text("output_name").notNull(),
    outputUnit: text("output_unit").notNull(),
    yieldQuantity: numeric("yield_quantity", {
      precision: 18,
      scale: 6,
    }).notNull(),
    notes: text("notes"),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("recipe_version_number").on(t.recipeId, t.version),
    check("recipe_yield_positive", sql`${t.yieldQuantity} > 0`),
  ],
);
export const recipeLines = pgTable(
  "recipe_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => recipeVersions.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    optional: boolean("optional").notNull().default(false),
  },
  (t) => [uniqueIndex("recipe_line_position").on(t.versionId, t.position)],
);
export const recipeOptions = pgTable(
  "recipe_options",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lineId: uuid("line_id")
      .notNull()
      .references(() => recipeLines.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "restrict" }),
    ingredientName: text("ingredient_name").notNull(),
    baseUnit: text("base_unit").notNull(),
    quantity: numeric("quantity", { precision: 18, scale: 6 }).notNull(),
  },
  (t) => [
    uniqueIndex("recipe_option_position").on(t.lineId, t.position),
    index("recipe_option_ingredient").on(t.ingredientId),
    check("recipe_option_quantity_positive", sql`${t.quantity} > 0`),
  ],
);
