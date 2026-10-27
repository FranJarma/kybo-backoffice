import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  date,
  timestamp,
  index,
  uniqueIndex,
  foreignKey,
  check,
} from "drizzle-orm/pg-core";
import { branches } from "./branch-schema";
import { user } from "./auth-schema";
import { items, suppliers, purchasePresentations } from "./business-schema";
import { purchaseReceiptLines } from "./inventory-schema";
export type PurchaseOrderState =
  "draft" | "ordered" | "partially_received" | "received" | "cancelled";
const qty = (name: string) => numeric(name, { precision: 18, scale: 6 });
export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    supplierName: text("supplier_name").notNull(),
    state: text("state").$type<PurchaseOrderState>().notNull().default("draft"),
    orderedOn: date("ordered_on").notNull(),
    expectedOn: date("expected_on"),
    notes: text("notes").notNull().default(""),
    revision: integer("revision").notNull().default(1),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("purchase_order_branch").on(t.id, t.branchId),
    index("purchase_order_queue").on(t.branchId, t.state, t.expectedOn),
    check(
      "purchase_order_state",
      sql`${t.state} in ('draft','ordered','partially_received','received','cancelled')`,
    ),
    check(
      "purchase_order_dates",
      sql`${t.expectedOn} is null or ${t.expectedOn} >= ${t.orderedOn}`,
    ),
    check("purchase_order_revision", sql`${t.revision} > 0`),
  ],
);
export const purchaseOrderLines = pgTable(
  "purchase_order_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => purchaseOrders.id),
    position: integer("position").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id),
    itemName: text("item_name").notNull(),
    baseUnit: text("base_unit").notNull(),
    presentationId: uuid("presentation_id").references(
      () => purchasePresentations.id,
    ),
    presentationName: text("presentation_name"),
    conversionFactor: qty("conversion_factor").notNull(),
    quantity: qty("quantity").notNull(),
    orderedQuantity: qty("ordered_quantity").notNull(),
    receivedQuantity: qty("received_quantity").notNull().default("0"),
    cancelledQuantity: qty("cancelled_quantity").notNull().default("0"),
  },
  (t) => [
    uniqueIndex("purchase_order_line_identity").on(t.id, t.orderId),
    uniqueIndex("purchase_order_line_position").on(t.orderId, t.position),
    check(
      "purchase_order_line_quantities",
      sql`${t.quantity}>0 and ${t.conversionFactor}>0 and ${t.orderedQuantity}>0 and ${t.receivedQuantity}>=0 and ${t.cancelledQuantity}>=0 and ${t.receivedQuantity}+${t.cancelledQuantity}<=${t.orderedQuantity}`,
    ),
  ],
);
export const purchaseOrderReceipts = pgTable(
  "purchase_order_receipt_allocations",
  {
    receiptLineId: uuid("receipt_line_id")
      .primaryKey()
      .references(() => purchaseReceiptLines.id),
    orderId: uuid("order_id").notNull(),
    orderLineId: uuid("order_line_id").notNull(),
    quantity: qty("quantity").notNull(),
  },
  (t) => [
    foreignKey({
      columns: [t.orderLineId, t.orderId],
      foreignColumns: [purchaseOrderLines.id, purchaseOrderLines.orderId],
    }),
    index("purchase_order_receipt_order").on(t.orderId),
    check("purchase_order_receipt_quantity", sql`${t.quantity}>0`),
  ],
);
