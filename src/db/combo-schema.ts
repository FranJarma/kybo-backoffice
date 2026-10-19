import {
  pgTable,
  uuid,
  integer,
  text,
  timestamp,
  numeric,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { products } from "./business-schema";
import { user } from "./auth-schema";
export const comboVersions = pgTable(
  "combo_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    revision: integer("revision").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("combo_product_revision").on(t.productId, t.revision)],
);
export const comboGroups = pgTable("combo_groups", {
  id: uuid("id").primaryKey().defaultRandom(),
  versionId: uuid("version_id")
    .notNull()
    .references(() => comboVersions.id),
  name: text("name").notNull(),
  position: integer("position").notNull(),
  quantity: integer("quantity").notNull(),
});
export const comboOptions = pgTable(
  "combo_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => comboGroups.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    position: integer("position").notNull(),
    counter: numeric("counter", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    pedidosya: numeric("pedidosya", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
    ubereats: numeric("ubereats", { precision: 14, scale: 2 })
      .notNull()
      .default("0"),
  },
  (t) => [uniqueIndex("combo_option_product").on(t.groupId, t.productId)],
);
