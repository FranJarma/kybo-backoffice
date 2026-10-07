import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  numeric,
  text,
  foreignKey,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { stockDocuments } from "./inventory-document-schema";
import { stockOperations, lotLocationBalances } from "./stock-schema";
import { items } from "./item-schema";
import { inventoryLots } from "./inventory-schema";
const qty = (name: string) =>
  numeric(name, { precision: 18, scale: 6 }).notNull().default("0");
export const stockReservations = pgTable(
  "stock_reservations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    branchId: uuid("branch_id").notNull(),
    documentId: uuid("document_id").notNull(),
    operationId: uuid("operation_id").notNull(),
    state: text("state").notNull().default("active"),
  },
  (t) => [
    uniqueIndex("reservation_document").on(t.documentId),
    uniqueIndex("reservation_branch").on(t.id, t.branchId),
    foreignKey({
      columns: [t.documentId, t.branchId],
      foreignColumns: [stockDocuments.id, stockDocuments.branchId],
    }),
    foreignKey({
      columns: [t.operationId, t.branchId],
      foreignColumns: [stockOperations.id, stockOperations.branchId],
    }),
    check(
      "reservation_state",
      sql`${t.state} in ('active','affected','settled')`,
    ),
  ],
);
export const reservationAllocations = pgTable(
  "reservation_allocations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    reservationId: uuid("reservation_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id),
    lotId: uuid("lot_id").notNull(),
    locationId: uuid("location_id").notNull(),
    allocated: qty("allocated"),
    consumed: qty("consumed"),
    released: qty("released"),
  },
  (t) => [
    uniqueIndex("reservation_lot_location").on(
      t.reservationId,
      t.lotId,
      t.locationId,
    ),
    foreignKey({
      columns: [t.lotId, t.itemId],
      foreignColumns: [inventoryLots.id, inventoryLots.itemId],
    }),
    foreignKey({
      columns: [t.reservationId, t.branchId],
      foreignColumns: [stockReservations.id, stockReservations.branchId],
    }),
    foreignKey({
      columns: [t.lotId, t.locationId, t.branchId],
      foreignColumns: [
        lotLocationBalances.lotId,
        lotLocationBalances.locationId,
        lotLocationBalances.branchId,
      ],
    }),
    check(
      "reservation_conservation",
      sql`${t.allocated}>0 and ${t.consumed}>=0 and ${t.released}>=0 and ${t.consumed}+${t.released}<=${t.allocated}`,
    ),
  ],
);
