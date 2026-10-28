import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  numeric,
  date,
  timestamp,
  index,
  uniqueIndex,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { branches } from "./branch-schema";
import { suppliers, paymentMethods } from "./business-schema";
import { purchaseOrders } from "./procurement-schema";
import { purchaseReceipts } from "./inventory-schema";
const amount = (name: string) => numeric(name, { precision: 18, scale: 2 });
export const purchaseAdvances = pgTable(
  "purchase_advances",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    orderId: uuid("order_id").notNull(),
    paymentMethodId: uuid("payment_method_id")
      .notNull()
      .references(() => paymentMethods.id),
    paymentMethodName: text("payment_method_name").notNull(),
    methodKind: text("method_kind").notNull(),
    source: text("source").$type<"cash" | "external">().notNull(),
    amount: amount("amount").notNull(),
    appliedAmount: amount("applied_amount").notNull().default("0"),
    paidOn: date("paid_on").notNull(),
    reference: text("reference"),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("purchase_advance_scope").on(
      t.id,
      t.orderId,
      t.branchId,
      t.supplierId,
    ),
    index("purchase_advance_order").on(t.orderId, t.createdAt),
    foreignKey({
      columns: [t.orderId, t.branchId, t.supplierId],
      foreignColumns: [
        purchaseOrders.id,
        purchaseOrders.branchId,
        purchaseOrders.supplierId,
      ],
    }),
    check(
      "purchase_advance_amounts",
      sql`${t.amount} > 0 and ${t.appliedAmount} >= 0 and ${t.appliedAmount} <= ${t.amount}`,
    ),
    check(
      "purchase_advance_source",
      sql`${t.source} in ('cash','external') and (${t.source} <> 'cash' or ${t.methodKind} = 'cash') and ${t.methodKind} in ('cash','card','transfer','other')`,
    ),
  ],
);
export const purchaseAdvanceApplications = pgTable(
  "purchase_advance_applications",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    advanceId: uuid("advance_id").notNull(),
    receiptId: uuid("receipt_id").notNull(),
    orderId: uuid("order_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    supplierId: uuid("supplier_id").notNull(),
    amount: amount("amount").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("purchase_advance_receipt_once").on(t.advanceId, t.receiptId),
    index("purchase_advance_application_receipt").on(t.receiptId),
    foreignKey({
      columns: [t.advanceId, t.orderId, t.branchId, t.supplierId],
      foreignColumns: [
        purchaseAdvances.id,
        purchaseAdvances.orderId,
        purchaseAdvances.branchId,
        purchaseAdvances.supplierId,
      ],
    }),
    foreignKey({
      columns: [t.receiptId, t.branchId, t.supplierId],
      foreignColumns: [
        purchaseReceipts.id,
        purchaseReceipts.branchId,
        purchaseReceipts.supplierId,
      ],
    }),
    check("purchase_advance_application_positive", sql`${t.amount} > 0`),
  ],
);
