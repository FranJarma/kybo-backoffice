import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  numeric,
  timestamp,
  uniqueIndex,
  index,
  check,
  foreignKey,
} from "drizzle-orm/pg-core";
import { items } from "./business-schema";
import { user } from "./auth-schema";
import { recipeVersions } from "./recipe-schema";
import { saleLines } from "./sales-schema";
const id = () => uuid("id").defaultRandom().primaryKey();
const qty = (n: string) => numeric(n, { precision: 18, scale: 6 }).notNull();
const money = (n: string) => numeric(n, { precision: 14, scale: 2 }).notNull();
const at = () =>
  timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
export const modifierGroups = pgTable("modifier_groups", {
  id: id(),
  name: text("name").notNull(),
  revision: integer("revision").notNull().default(1),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: at(),
});
export const modifierGroupVersions = pgTable(
  "modifier_group_versions",
  {
    id: id(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => modifierGroups.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    name: text("name").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: at(),
  },
  (t) => [uniqueIndex("modifier_version_number").on(t.groupId, t.version)],
);
export const modifierOptions = pgTable(
  "modifier_options",
  {
    id: id(),
    groupVersionId: uuid("group_version_id")
      .notNull()
      .references(() => modifierGroupVersions.id, { onDelete: "restrict" }),
    key: text("key").notNull(),
    name: text("name").notNull(),
    kind: text("kind").notNull(),
    instruction: text("instruction"),
    position: integer("position").notNull(),
  },
  (t) => [
    uniqueIndex("modifier_option_key").on(t.groupVersionId, t.key),
    uniqueIndex("modifier_option_owner").on(t.id, t.groupVersionId),
    check(
      "modifier_option_kind",
      sql`${t.kind} in ('composition','instruction')`,
    ),
  ],
);
export const recipeModifierGroups = pgTable(
  "recipe_modifier_groups",
  {
    id: id(),
    recipeVersionId: uuid("recipe_version_id")
      .notNull()
      .references(() => recipeVersions.id, { onDelete: "restrict" }),
    groupId: uuid("group_id")
      .notNull()
      .references(() => modifierGroups.id, { onDelete: "restrict" }),
    groupVersionId: uuid("group_version_id")
      .notNull()
      .references(() => modifierGroupVersions.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    position: integer("position").notNull(),
    min: integer("min").notNull(),
    max: integer("max").notNull(),
    factor: qty("factor"),
  },
  (t) => [
    uniqueIndex("recipe_modifier_group_once").on(t.recipeVersionId, t.groupId),
    uniqueIndex("recipe_modifier_group_owner").on(t.id, t.groupVersionId),
    uniqueIndex("recipe_modifier_group_recipe").on(t.id, t.recipeVersionId),
    check(
      "recipe_modifier_limits",
      sql`${t.min} >= 0 and ${t.max} >= ${t.min} and ${t.factor} > 0`,
    ),
  ],
);
export const recipeModifierOptions = pgTable(
  "recipe_modifier_options",
  {
    id: id(),
    recipeModifierGroupId: uuid("recipe_modifier_group_id").notNull(),
    groupVersionId: uuid("group_version_id").notNull(),
    optionId: uuid("option_id").notNull(),
    recipeVersionId: uuid("recipe_version_id").notNull(),
    enabled: boolean("enabled").notNull(),
    defaultCount: integer("default_count").notNull(),
    maxCount: integer("max_count").notNull(),
    mode: text("mode").notNull(),
  },
  (t) => [
    uniqueIndex("recipe_modifier_option_once").on(
      t.recipeModifierGroupId,
      t.optionId,
    ),
    uniqueIndex("recipe_modifier_option_recipe").on(t.id, t.recipeVersionId),
    foreignKey({
      columns: [t.recipeModifierGroupId, t.groupVersionId],
      foreignColumns: [
        recipeModifierGroups.id,
        recipeModifierGroups.groupVersionId,
      ],
    }),
    foreignKey({
      columns: [t.optionId, t.groupVersionId],
      foreignColumns: [modifierOptions.id, modifierOptions.groupVersionId],
    }),
    foreignKey({
      columns: [t.recipeModifierGroupId, t.recipeVersionId],
      foreignColumns: [
        recipeModifierGroups.id,
        recipeModifierGroups.recipeVersionId,
      ],
    }),
    check(
      "recipe_modifier_option_rules",
      sql`${t.defaultCount} >= 0 and ${t.maxCount} >= ${t.defaultCount} and ${t.mode} in ('inherit','override')`,
    ),
  ],
);
export const modifierOptionComponents = pgTable(
  "modifier_option_components",
  {
    id: id(),
    optionId: uuid("option_id")
      .notNull()
      .references(() => modifierOptions.id, { onDelete: "restrict" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    baseUnit: text("base_unit").notNull(),
    quantity: qty("quantity"),
  },
  (t) => [
    uniqueIndex("modifier_option_components_once").on(t.optionId, t.itemId),
    index("modifier_option_components_item").on(t.itemId),
    check("modifier_option_components_positive", sql`${t.quantity} > 0`),
  ],
);
export const recipeModifierOptionComponents = pgTable(
  "recipe_modifier_option_components",
  {
    id: id(),
    recipeModifierOptionId: uuid("recipe_modifier_option_id")
      .notNull()
      .references(() => recipeModifierOptions.id, { onDelete: "restrict" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    baseUnit: text("base_unit").notNull(),
    quantity: qty("quantity"),
  },
  (t) => [
    uniqueIndex("recipe_modifier_option_components_once").on(
      t.recipeModifierOptionId,
      t.itemId,
    ),
    index("recipe_modifier_option_components_item").on(t.itemId),
    check("recipe_modifier_option_components_positive", sql`${t.quantity} > 0`),
  ],
);
export const recipeModifierOptionPrices = pgTable(
  "recipe_modifier_option_prices",
  {
    id: id(),
    recipeModifierOptionId: uuid("recipe_modifier_option_id")
      .notNull()
      .references(() => recipeModifierOptions.id, { onDelete: "restrict" }),
    channel: text("channel").notNull(),
    surcharge: money("surcharge"),
  },
  (t) => [
    uniqueIndex("modifier_price_channel").on(
      t.recipeModifierOptionId,
      t.channel,
    ),
    check(
      "modifier_price_valid",
      sql`${t.surcharge} >= 0 and ${t.channel} in ('counter','pedidosya','ubereats')`,
    ),
  ],
);
export const saleLineModifiers = pgTable(
  "sale_line_modifiers",
  {
    id: id(),
    saleLineId: uuid("sale_line_id").notNull(),
    recipeVersionId: uuid("recipe_version_id").notNull(),
    recipeModifierOptionId: uuid("recipe_modifier_option_id").notNull(),
    groupName: text("group_name").notNull(),
    optionName: text("option_name").notNull(),
    count: integer("count").notNull(),
    instruction: text("instruction"),
    unitSurcharge: money("unit_surcharge"),
  },
  (t) => [
    uniqueIndex("sale_modifier_once").on(
      t.saleLineId,
      t.recipeModifierOptionId,
    ),
    foreignKey({
      columns: [t.recipeModifierOptionId, t.recipeVersionId],
      foreignColumns: [
        recipeModifierOptions.id,
        recipeModifierOptions.recipeVersionId,
      ],
    }),
    foreignKey({
      columns: [t.saleLineId, t.recipeVersionId],
      foreignColumns: [saleLines.id, saleLines.recipeVersionId],
    }),
    check(
      "sale_modifier_count",
      sql`${t.count} > 0 and ${t.unitSurcharge} >= 0`,
    ),
  ],
);
export const saleLineComponents = pgTable(
  "sale_line_components",
  {
    id: id(),
    saleLineId: uuid("sale_line_id")
      .notNull()
      .references(() => saleLines.id, { onDelete: "restrict" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    baseUnit: text("base_unit").notNull(),
    quantity: qty("quantity"),
  },
  (t) => [
    uniqueIndex("sale_component_once").on(t.saleLineId, t.itemId),
    check("sale_component_positive", sql`${t.quantity} > 0`),
  ],
);
