import { pgTable, uuid, text, integer, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
export const mediaAssets = pgTable("media_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  provider: text("provider").notNull(),
  storageKey: text("storage_key").notNull().unique(),
  contentType: text("content_type").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  bytes: integer("bytes").notNull(),
  creatorId: text("creator_id")
    .notNull()
    .references(() => user.id),
  claimedProductId: uuid("claimed_product_id"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  detachedAt: timestamp("detached_at", { withTimezone: true }),
  deletingAt: timestamp("deleting_at", { withTimezone: true }),
});
