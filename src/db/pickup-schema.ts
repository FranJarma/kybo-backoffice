import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  integer,
  text,
  timestamp,
  uniqueIndex,
  index,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { branches } from "./branch-schema";
import { saleOrders } from "./sales-schema";
import { user } from "./auth-schema";

export const locatorAssignments = pgTable(
  "locator_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    orderId: uuid("order_id").notNull(),
    number: integer("number").notNull(),
    assignedBy: text("assigned_by")
      .notNull()
      .references(() => user.id),
    assignedAt: timestamp("assigned_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    returnedBy: text("returned_by").references(() => user.id),
    returnedAt: timestamp("returned_at", { withTimezone: true }),
  },
  (t) => [
    foreignKey({
      columns: [t.orderId, t.branchId],
      foreignColumns: [saleOrders.id, saleOrders.branchId],
    }),
    uniqueIndex("locator_number_occupied")
      .on(t.branchId, t.number)
      .where(sql`${t.returnedAt} is null`),
    uniqueIndex("locator_order_occupied")
      .on(t.orderId)
      .where(sql`${t.returnedAt} is null`),
    index("locator_order_history").on(t.orderId, t.assignedAt),
    check("locator_positive", sql`${t.number} > 0`),
    check(
      "locator_return_pair",
      sql`(${t.returnedAt} is null and ${t.returnedBy} is null) or (${t.returnedAt} is not null and ${t.returnedBy} is not null and ${t.returnedAt} >= ${t.assignedAt})`,
    ),
  ],
);
