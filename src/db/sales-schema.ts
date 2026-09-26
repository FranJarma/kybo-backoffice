import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  timestamp,
  date,
  serial,
  check,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { customers, products, paymentMethods } from "./business-schema";
import { recipeVersions } from "./recipe-schema";
const at = (name: string) =>
  timestamp(name, { withTimezone: true }).notNull().defaultNow();
const amount = (name: string) =>
  numeric(name, { precision: 14, scale: 2 }).notNull();

export const diningTables = pgTable(
  "dining_tables",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    capacity: integer("capacity").notNull(),
    x: integer("x").notNull(),
    y: integer("y").notNull(),
    revision: integer("revision").notNull().default(1),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdAt: at("created_at"),
  },
  (t) => [
    uniqueIndex("table_active_cell")
      .on(t.x, t.y)
      .where(sql`${t.archivedAt} is null`),
    check(
      "table_grid_bounds",
      sql`${t.x} between 0 and 5 and ${t.y} between 0 and 5 and ${t.capacity} between 1 and 30`,
    ),
  ],
);
export const sales = pgTable(
  "sales",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    number: serial("number").notNull(),
    revision: integer("revision").notNull().default(1),
    origin: text("origin").notNull(),
    channel: text("channel").notNull(),
    fulfillment: text("fulfillment").notNull(),
    status: text("status").notNull(),
    tableId: uuid("table_id").references(() => diningTables.id, {
      onDelete: "restrict",
    }),
    tableName: text("table_name"),
    customerId: uuid("customer_id").references(() => customers.id, {
      onDelete: "restrict",
    }),
    customerName: text("customer_name"),
    externalId: text("external_id"),
    notes: text("notes"),
    totalAmount: amount("total_amount"),
    paidAmount: amount("paid_amount").default("0"),
    businessDate: date("business_date").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: at("created_at"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    cancelReason: text("cancel_reason"),
  },
  (t) => [
    uniqueIndex("sale_number").on(t.number),
    uniqueIndex("sale_external_identity")
      .on(t.channel, t.externalId)
      .where(sql`${t.externalId} is not null`),
    uniqueIndex("sale_open_table")
      .on(t.tableId)
      .where(sql`${t.origin} = 'table' and ${t.status} = 'open'`),
    index("sale_date").on(t.businessDate, t.createdAt),
    check("sale_origin", sql`${t.origin} in ('counter','table','delivery')`),
    check(
      "sale_channel",
      sql`(${t.origin} = 'delivery' and ${t.channel} in ('pedidosya','ubereats') and ${t.externalId} is not null and ${t.fulfillment} in ('delivery','pickup') and ${t.tableId} is null) or (${t.origin} in ('counter','table') and ${t.channel} = 'counter' and ${t.externalId} is null and ${t.fulfillment} in ('takeaway','dine_in'))`,
    ),
    check(
      "sale_table_required",
      sql`${t.origin} <> 'table' or (${t.tableId} is not null and ${t.fulfillment} = 'dine_in')`,
    ),
    check(
      "sale_amounts",
      sql`${t.totalAmount} >= 0 and ${t.paidAmount} >= 0 and ${t.paidAmount} <= ${t.totalAmount}`,
    ),
    check("sale_status", sql`${t.status} in ('open','closed','cancelled')`),
  ],
);
export const saleOrders = pgTable(
  "sale_orders",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "restrict" }),
    sequence: integer("sequence").notNull(),
    totalAmount: amount("total_amount"),
    notes: text("notes"),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: at("created_at"),
  },
  (t) => [uniqueIndex("sale_order_sequence").on(t.saleId, t.sequence)],
);
export const saleLines = pgTable(
  "sale_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => saleOrders.id, { onDelete: "restrict" }),
    position: integer("position").notNull(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    name: text("name").notNull(),
    quantity: integer("quantity").notNull(),
    listPrice: numeric("list_price", { precision: 14, scale: 2 }),
    unitPrice: amount("unit_price"),
    lineTotal: amount("line_total"),
    priceReason: text("price_reason"),
    notes: text("notes"),
    recipeVersionId: uuid("recipe_version_id").references(
      () => recipeVersions.id,
      { onDelete: "restrict" },
    ),
  },
  (t) => [
    uniqueIndex("sale_line_position").on(t.orderId, t.position),
    check(
      "sale_line_values",
      sql`${t.quantity} between 1 and 999 and ${t.unitPrice} >= 0 and ${t.lineTotal} = ${t.unitPrice} * ${t.quantity} and (${t.listPrice} is null or ${t.listPrice} >= 0)`,
    ),
  ],
);
export const salePayments = pgTable(
  "sale_payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "restrict" }),
    kind: text("kind").notNull(),
    collector: text("collector").notNull(),
    methodId: uuid("method_id").references(() => paymentMethods.id, {
      onDelete: "restrict",
    }),
    methodName: text("method_name"),
    methodKind: text("method_kind"),
    amount: amount("amount"),
    reference: text("reference"),
    originalPaymentId: uuid("original_payment_id").references(
      (): AnyPgColumn => salePayments.id,
      { onDelete: "restrict" },
    ),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: at("created_at"),
  },
  (t) => [
    index("sale_payment_sale").on(t.saleId),
    uniqueIndex("sale_payment_refund_once").on(t.originalPaymentId),
    check("sale_payment_amount", sql`${t.amount} > 0`),
    check(
      "sale_payment_collector",
      sql`(${t.collector} = 'local' and ${t.methodId} is not null) or (${t.collector} = 'platform' and ${t.methodId} is null)`,
    ),
    check(
      "sale_payment_kind",
      sql`(${t.kind} = 'collection' and ${t.originalPaymentId} is null) or (${t.kind} = 'refund' and ${t.originalPaymentId} is not null)`,
    ),
  ],
);
