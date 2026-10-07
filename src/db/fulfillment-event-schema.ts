import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  integer,
  text,
  foreignKey,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { saleLines } from "./sales-schema";
import { productFulfillmentVersions } from "./product-fulfillment-schema";
import { stockReservations } from "./reservation-schema";
import { stockOperations } from "./stock-schema";
import { stockDocuments } from "./inventory-document-schema";
export const saleLineFulfillments = pgTable(
  "sale_line_fulfillments",
  {
    saleLineId: uuid("sale_line_id")
      .primaryKey()
      .references(() => saleLines.id),
    branchId: uuid("branch_id").notNull(),
    versionId: uuid("version_id")
      .notNull()
      .references(() => productFulfillmentVersions.id),
    documentId: uuid("document_id").notNull(),
    reservationId: uuid("reservation_id").notNull(),
    mode: text("mode").notNull(),
    ordered: integer("ordered").notNull(),
    completed: integer("completed").notNull().default(0),
    delivered: integer("delivered").notNull().default(0),
    cancelled: integer("cancelled").notNull().default(0),
    revision: integer("revision").notNull().default(1),
  },
  (t) => [
    uniqueIndex("sale_line_fulfillment_branch").on(t.saleLineId, t.branchId),
    foreignKey({
      columns: [t.documentId, t.branchId],
      foreignColumns: [stockDocuments.id, stockDocuments.branchId],
    }),
    foreignKey({
      columns: [t.reservationId, t.branchId],
      foreignColumns: [stockReservations.id, stockReservations.branchId],
    }),
    check("line_fulfillment_mode", sql`${t.mode} in ('direct','recipe')`),
    check(
      "line_fulfillment_quantities",
      sql`${t.ordered}>0 and ${t.completed}>=0 and ${t.delivered}>=0 and ${t.cancelled}>=0 and ${t.completed}+${t.cancelled}<=${t.ordered} and ${t.delivered}+${t.cancelled}<=${t.ordered} and (${t.mode}<>'recipe' or ${t.delivered}<=${t.completed})`,
    ),
  ],
);
export const fulfillmentEvents = pgTable(
  "fulfillment_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    operationId: uuid("operation_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    saleLineId: uuid("sale_line_id").notNull(),
    action: text("action").notNull(),
    quantity: integer("quantity").notNull(),
    revision: integer("revision").notNull(),
  },
  (t) => [
    uniqueIndex("line_fulfillment_revision").on(t.saleLineId, t.revision),
    foreignKey({
      columns: [t.saleLineId, t.branchId],
      foreignColumns: [
        saleLineFulfillments.saleLineId,
        saleLineFulfillments.branchId,
      ],
    }),
    foreignKey({
      columns: [t.operationId, t.branchId],
      foreignColumns: [stockOperations.id, stockOperations.branchId],
    }),
    check("fulfillment_event_quantity", sql`${t.quantity}>0`),
    check(
      "fulfillment_event_action",
      sql`${t.action} in ('complete','deliver','cancel')`,
    ),
  ],
);
