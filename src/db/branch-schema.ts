import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  timestamp,
  uniqueIndex,
  primaryKey,
  check,
  foreignKey,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { products } from "./business-schema";
const at = (name: string) => timestamp(name, { withTimezone: true });
export const branches = pgTable(
  "branches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    timeZone: text("time_zone").notNull(),
    revision: integer("revision").notNull().default(1),
    archivedAt: at("archived_at"),
    createdAt: at("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("branch_code").on(t.code),
    check("branch_code_valid", sql`${t.code} ~ '^[A-Z0-9][A-Z0-9._-]*$'`),
  ],
);
export const locations = pgTable(
  "locations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    archivedAt: at("archived_at"),
    revision: integer("revision").notNull().default(1),
  },
  (t) => [
    uniqueIndex("location_branch_code").on(t.branchId, t.code),
    uniqueIndex("location_branch_identity").on(t.id, t.branchId),
  ],
);
export const branchMemberships = pgTable(
  "branch_memberships",
  {
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    role: text("role").notNull(),
    revokedAt: at("revoked_at"),
  },
  (t) => [
    primaryKey({ columns: [t.branchId, t.userId] }),
    check("branch_membership_role", sql`${t.role} in ('manager','staff')`),
  ],
);
export const branchProducts = pgTable(
  "branch_products",
  {
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id, { onDelete: "restrict" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    enabled: boolean("enabled").notNull().default(false),
    dispatchLocationId: uuid("dispatch_location_id"),
  },
  (t) => [
    primaryKey({ columns: [t.branchId, t.productId] }),
    foreignKey({
      columns: [t.dispatchLocationId, t.branchId],
      foreignColumns: [locations.id, locations.branchId],
      name: "branch_product_dispatch_location",
    }).onDelete("restrict"),
  ],
);
