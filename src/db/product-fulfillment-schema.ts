import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  foreignKey,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { products } from "./business-schema";
import { items } from "./item-schema";
import { recipeVersions } from "./recipe-schema";
export const productFulfillmentVersions = pgTable(
  "product_fulfillment_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    version: integer("version").notNull(),
    mode: text("mode").notNull(),
    itemId: uuid("item_id").references(() => items.id),
    quantity: numeric("quantity", { precision: 18, scale: 6 }),
    recipeVersionId: uuid("recipe_version_id").references(
      () => recipeVersions.id,
    ),
  },
  (t) => [
    uniqueIndex("fulfillment_product_version").on(t.productId, t.version),
    uniqueIndex("fulfillment_version_owner").on(t.id, t.productId),
    check(
      "fulfillment_mode",
      sql`(${t.mode}='direct' and ${t.itemId} is not null and ${t.quantity}>0 and ${t.recipeVersionId} is null) or (${t.mode}='recipe' and ${t.recipeVersionId} is not null and ${t.itemId} is null and ${t.quantity} is null)`,
    ),
  ],
);
export const productFulfillments = pgTable(
  "product_fulfillments",
  {
    productId: uuid("product_id")
      .primaryKey()
      .references(() => products.id),
    versionId: uuid("version_id").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.versionId, t.productId],
      foreignColumns: [
        productFulfillmentVersions.id,
        productFulfillmentVersions.productId,
      ],
    }),
  ],
);
