import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  timestamp,
  numeric,
  date,
  integer,
  varchar,
  text,
  check,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { items, suppliers, purchasePresentations } from "./business-schema";
import { user } from "./auth-schema";

export const itemSuppliers = pgTable(
  "item_suppliers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("item_supplier_unique").on(t.itemId, t.supplierId)],
);

export const supplierQuotes = pgTable(
  "supplier_quotes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    presentationId: uuid("presentation_id")
      .notNull()
      .references(() => purchasePresentations.id, { onDelete: "restrict" }),
    presentationName: varchar("presentation_name", { length: 160 }).notNull(),
    supplierName: varchar("supplier_name", { length: 160 }).notNull(),
    baseQuantity: numeric("base_quantity", {
      precision: 18,
      scale: 6,
    }).notNull(),
    baseUnit: text("base_unit").notNull(),
    price: numeric("price", { precision: 18, scale: 6 }).notNull(),
    quotedOn: date("quoted_on").notNull(),
    validUntil: date("valid_until"),
    leadTimeDays: integer("lead_time_days"),
    minimumPacks: integer("minimum_packs").notNull().default(1),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check("supplier_quote_quantity", sql`${t.baseQuantity} > 0`),
    check("supplier_quote_price", sql`${t.price} >= 0`),
    check("supplier_quote_unit", sql`${t.baseUnit} in ('g','ml','unit')`),
    check(
      "supplier_quote_validity",
      sql`${t.validUntil} is null or ${t.validUntil} >= ${t.quotedOn}`,
    ),
    check(
      "supplier_quote_lead_time",
      sql`${t.leadTimeDays} is null or ${t.leadTimeDays} between 0 and 365`,
    ),
    check(
      "supplier_quote_minimum",
      sql`${t.minimumPacks} between 1 and 1000000`,
    ),
    index("supplier_quote_item_date").on(t.itemId, t.quotedOn, t.createdAt),
    index("supplier_quote_presentation_date").on(
      t.presentationId,
      t.quotedOn,
      t.createdAt,
    ),
  ],
);
