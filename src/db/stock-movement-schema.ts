import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  numeric,
  timestamp,
  check,
  foreignKey,
  bigserial,
} from "drizzle-orm/pg-core";
import { stockDocuments } from "./inventory-document-schema";
import { stockOperations, lotLocationBalances } from "./stock-schema";
import { items } from "./item-schema";
import { inventoryLots } from "./inventory-schema";
export const stockMovements = pgTable(
  "stock_movements",
  {
    sequence: bigserial("sequence", { mode: "number" }).notNull().unique(),
    id: uuid("id").defaultRandom().primaryKey(),
    branchId: uuid("branch_id").notNull(),
    operationId: uuid("operation_id").notNull(),
    documentId: uuid("document_id").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id),
    lotId: uuid("lot_id").notNull(),
    locationId: uuid("location_id").notNull(),
    action: text("action").notNull(),
    reason: text("reason"),
    quantity: numeric("quantity", { precision: 18, scale: 6 }).notNull(),
    value: numeric("value", { precision: 24, scale: 6 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.lotId, t.itemId],
      foreignColumns: [inventoryLots.id, inventoryLots.itemId],
    }),
    foreignKey({
      columns: [t.documentId, t.branchId],
      foreignColumns: [stockDocuments.id, stockDocuments.branchId],
    }),
    foreignKey({
      columns: [t.operationId, t.branchId],
      foreignColumns: [stockOperations.id, stockOperations.branchId],
    }),
    foreignKey({
      columns: [t.lotId, t.locationId, t.branchId],
      foreignColumns: [
        lotLocationBalances.lotId,
        lotLocationBalances.locationId,
        lotLocationBalances.branchId,
      ],
    }),
    check("stock_movement_nonzero", sql`${t.quantity}<>0`),
    check(
      "stock_movement_value_sign",
      sql`${t.value} is null or ${t.quantity}*${t.value}>=0`,
    ),
  ],
);
