import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { products } from "./business-schema";
import { user } from "./auth-schema";
export const productOptionGroups = pgTable(
  "product_option_groups",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    revision: integer("revision").notNull().default(1),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [check("product_option_group_revision", sql`${t.revision} > 0`)],
);
export const productOptionGroupVersions = pgTable(
  "product_option_group_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    groupId: uuid("group_id")
      .notNull()
      .references(() => productOptionGroups.id),
    version: integer("version").notNull(),
    name: text("name").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("product_option_group_number").on(t.groupId, t.version),
    uniqueIndex("product_option_group_owner").on(t.id, t.groupId),
    check("product_option_group_version_positive", sql`${t.version} > 0`),
  ],
);
export const productOptionGroupProducts = pgTable(
  "product_option_group_products",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => productOptionGroupVersions.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    position: integer("position").notNull(),
  },
  (t) => [
    uniqueIndex("product_option_group_product_once").on(
      t.versionId,
      t.productId,
    ),
    uniqueIndex("product_option_group_position_once").on(
      t.versionId,
      t.position,
    ),
    check("product_option_group_position_valid", sql`${t.position} >= 0`),
  ],
);
