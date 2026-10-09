import { mediaAssets } from "./media-schema";
import { items } from "./item-schema";
export { items } from "./item-schema";
import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  varchar,
  integer,
  timestamp,
  numeric,
  boolean,
  jsonb,
  check,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

const common = () => ({
  id: uuid("id").defaultRandom().primaryKey(),
  name: varchar("name", { length: 160 }).notNull(),
  revision: integer("revision").notNull().default(1),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
const contact = () => ({
  email: varchar("email", { length: 254 }),
  phone: varchar("phone", { length: 16 }),
});

export const suppliers = pgTable("suppliers", {
  ...common(),
  ...contact(),
  notes: text("notes"),
});
export const customers = pgTable("customers", {
  ...common(),
  ...contact(),
  marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
});
export const paymentMethods = pgTable(
  "payment_methods",
  { ...common(), kind: text("kind").notNull() },
  (t) => [
    check(
      "payment_method_kind",
      sql`${t.kind} in ('cash','card','transfer','other')`,
    ),
  ],
);
export const productCategories = pgTable(
  "product_categories",
  {
    ...common(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [
    check("category_order", sql`${t.sortOrder} >= 0`),
    uniqueIndex("category_active_name")
      .on(sql`lower(trim(${t.name}))`)
      .where(sql`${t.archivedAt} is null`),
  ],
);
export const products = pgTable(
  "products",
  {
    ...common(),
    categoryId: uuid("category_id").references(() => productCategories.id, {
      onDelete: "restrict",
    }),
    description: text("description"),
    imageAssetId: uuid("image_asset_id").references(() => mediaAssets.id, {
      onDelete: "restrict",
    }),
    sortOrder: integer("sort_order").notNull().default(0),
    enabledCounter: boolean("enabled_counter").notNull().default(true),
    enabledPedidosYa: boolean("enabled_pedidosya").notNull().default(true),
    enabledUberEats: boolean("enabled_ubereats").notNull().default(true),
  },
  (t) => [
    check("product_order", sql`${t.sortOrder} >= 0`),
    uniqueIndex("product_image_unique").on(t.imageAssetId),
  ],
);
export const productPrices = pgTable(
  "product_prices",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    channel: text("channel").notNull(),
    amount: numeric("amount", { precision: 14, scale: 2 }).notNull(),
  },
  (t) => [
    uniqueIndex("product_price_channel").on(t.productId, t.channel),
    check("product_price_nonnegative", sql`${t.amount} >= 0`),
    check(
      "product_price_channel_valid",
      sql`${t.channel} in ('counter','pedidosya','ubereats')`,
    ),
  ],
);
export const purchasePresentations = pgTable(
  "purchase_presentations",
  {
    ...common(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id, { onDelete: "restrict" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id, { onDelete: "restrict" }),
    baseQuantity: numeric("base_quantity", {
      precision: 18,
      scale: 6,
    }).notNull(),
  },
  (t) => [
    check("presentation_quantity_positive", sql`${t.baseQuantity} > 0`),
    index("presentation_item").on(t.itemId),
    index("presentation_supplier").on(t.supplierId),
  ],
);
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    entity: text("entity").notNull(),
    recordId: uuid("record_id").notNull(),
    action: text("action").notNull(),
    before: jsonb("before"),
    after: jsonb("after").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("audit_record").on(t.entity, t.recordId)],
);
