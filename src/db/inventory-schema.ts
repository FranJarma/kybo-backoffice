import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  varchar,
  date,
  numeric,
  integer,
  boolean,
  timestamp,
  check,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import {
  ingredients,
  suppliers,
  paymentMethods,
  purchasePresentations,
} from "./business-schema";

const quantity = (name: string) => numeric(name, { precision: 18, scale: 6 });
const value = (name: string) => numeric(name, { precision: 24, scale: 6 });
const amount = (name: string) => numeric(name, { precision: 18, scale: 2 });
export const inventoryOperations = pgTable("inventory_operations", {
  requestId: uuid("request_id").primaryKey(),
  actorId: text("actor_id")
    .notNull()
    .references(() => user.id, { onDelete: "restrict" }),
  kind: text("kind").notNull(),
  fingerprint: text("fingerprint").notNull(),
  resultId: uuid("result_id").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const purchaseReceipts = pgTable(
  "purchase_receipts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    supplierName: varchar("supplier_name", { length: 160 }).notNull(),
    receivedOn: date("received_on").notNull(),
    documentNumber: varchar("document_number", { length: 120 }),
    notes: text("notes"),
    totalAmount: amount("total_amount"),
    paidAmount: amount("paid_amount").notNull().default("0"),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("receipt_supplier_document").on(t.supplierId, t.documentNumber),
    check(
      "receipt_total_positive",
      sql`${t.totalAmount} is null or ${t.totalAmount} >= 0`,
    ),
    check("receipt_paid_nonnegative", sql`${t.paidAmount} >= 0`),
  ],
);
export const purchaseReceiptLines = pgTable(
  "purchase_receipt_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => purchaseReceipts.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "restrict" }),
    ingredientName: varchar("ingredient_name", { length: 160 }).notNull(),
    baseUnit: text("base_unit").notNull(),
    presentationId: uuid("presentation_id").references(
      () => purchasePresentations.id,
      { onDelete: "restrict" },
    ),
    presentationName: varchar("presentation_name", { length: 160 }),
    conversionFactor: quantity("conversion_factor").notNull(),
    quantity: quantity("quantity").notNull(),
    baseQuantity: quantity("base_quantity").notNull(),
    unitPrice: quantity("unit_price"),
    discount: amount("discount").notNull().default("0"),
    lineTotal: amount("line_total"),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => inventoryLots.id, { onDelete: "restrict" }),
    lotCode: varchar("lot_code", { length: 120 }),
    expiresOn: date("expires_on"),
  },
  (t) => [
    index("receipt_lines_receipt").on(t.receiptId),
    uniqueIndex("receipt_line_lot").on(t.lotId),
    check(
      "receipt_line_quantity_positive",
      sql`${t.quantity} > 0 and ${t.baseQuantity} > 0 and ${t.conversionFactor} > 0`,
    ),
    check(
      "receipt_line_price_nonnegative",
      sql`${t.unitPrice} is null or ${t.unitPrice} >= 0`,
    ),
    check(
      "receipt_line_cost_valid",
      sql`${t.discount} >= 0 and (${t.lineTotal} is null or ${t.lineTotal} >= 0)`,
    ),
  ],
);
export const purchasePayments = pgTable(
  "purchase_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    receiptId: uuid("receipt_id")
      .notNull()
      .references(() => purchaseReceipts.id, { onDelete: "restrict" }),
    paymentMethodId: uuid("payment_method_id")
      .notNull()
      .references(() => paymentMethods.id, { onDelete: "restrict" }),
    paymentMethodName: varchar("payment_method_name", {
      length: 160,
    }).notNull(),
    amount: amount("amount").notNull(),
    paidOn: date("paid_on").notNull(),
    reference: varchar("reference", { length: 160 }),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("payments_receipt").on(t.receiptId),
    check("payment_amount_positive", sql`${t.amount} > 0`),
  ],
);
export const stockBalances = pgTable(
  "stock_balances",
  {
    ingredientId: uuid("ingredient_id")
      .primaryKey()
      .references(() => ingredients.id, { onDelete: "restrict" }),
    physicalQuantity: quantity("physical_quantity").notNull().default("0"),
    stockValue: value("stock_value"),
  },
  (t) => [
    check("balance_quantity_nonnegative", sql`${t.physicalQuantity} >= 0`),
    check(
      "balance_value_nonnegative",
      sql`${t.stockValue} is null or ${t.stockValue} >= 0`,
    ),
  ],
);
export const inventoryLots = pgTable(
  "inventory_lots",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "restrict" }),
    receiptId: uuid("receipt_id").references(() => purchaseReceipts.id, {
      onDelete: "restrict",
    }),
    receivedOn: date("received_on").notNull(),
    expiresOn: date("expires_on"),
    lotCode: varchar("lot_code", { length: 120 }),
    initialQuantity: quantity("initial_quantity").notNull(),
    remainingQuantity: quantity("remaining_quantity").notNull(),
    blocked: boolean("blocked").notNull().default(false),
    revision: integer("revision").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("lot_ingredient_expiry").on(t.ingredientId, t.expiresOn),
    check(
      "lot_quantities_nonnegative",
      sql`${t.initialQuantity} >= 0 and ${t.remainingQuantity} >= 0`,
    ),
  ],
);
export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredients.id, { onDelete: "restrict" }),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => inventoryLots.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    delta: quantity("delta").notNull(),
    unitCost: value("unit_cost"),
    valueDelta: value("value_delta"),
    reason: text("reason"),
    referenceId: uuid("reference_id").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    actorName: varchar("actor_name", { length: 160 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("movement_ingredient_recent").on(t.ingredientId, t.createdAt),
    check(
      "movement_kind",
      sql`${t.kind} in ('receipt','opening','waste','count','production_in','production_out')`,
    ),
  ],
);
export const inventoryLotEvents = pgTable(
  "inventory_lot_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => inventoryLots.id, { onDelete: "restrict" }),
    blocked: boolean("blocked").notNull(),
    reason: text("reason").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("lot_event_lot").on(t.lotId)],
);
