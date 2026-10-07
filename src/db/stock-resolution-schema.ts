import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  numeric,
  integer,
  foreignKey,
  check,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { sales } from "./sales-schema";
import { branches } from "./branch-schema";
import { saleLineFulfillments } from "./fulfillment-event-schema";
import { stockOperations } from "./stock-schema";
import { reservationAllocations } from "./reservation-schema";
export const stockResolutions = pgTable(
  "stock_resolutions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id),
    state: text("state").notNull().default("pending"),
    revision: integer("revision").notNull().default(1),
  },
  (t) => [
    uniqueIndex("stock_resolution_sale").on(t.saleId),
    foreignKey({
      name: "stock_resolution_sale_branch",
      columns: [t.saleId, t.branchId],
      foreignColumns: [sales.id, sales.branchId],
    }),
    uniqueIndex("stock_resolution_branch").on(t.id, t.branchId),
    check("stock_resolution_state", sql`${t.state} in ('pending','resolved')`),
  ],
);
export const stockResolutionLines = pgTable(
  "stock_resolution_lines",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    resolutionId: uuid("resolution_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    saleLineId: uuid("sale_line_id").notNull(),
    allocationId: uuid("allocation_id")
      .notNull()
      .references(() => reservationAllocations.id),
    pending: numeric("pending", { precision: 18, scale: 6 }).notNull(),
    consumed: numeric("consumed", { precision: 18, scale: 6 })
      .notNull()
      .default("0"),
    unused: numeric("unused", { precision: 18, scale: 6 })
      .notNull()
      .default("0"),
  },
  (t) => [
    uniqueIndex("resolution_allocation").on(t.resolutionId, t.allocationId),
    foreignKey({
      columns: [t.resolutionId, t.branchId],
      foreignColumns: [stockResolutions.id, stockResolutions.branchId],
    }),
    foreignKey({
      columns: [t.saleLineId, t.branchId],
      foreignColumns: [
        saleLineFulfillments.saleLineId,
        saleLineFulfillments.branchId,
      ],
    }),
    check(
      "stock_resolution_conservation",
      sql`${t.pending}>0 and ${t.consumed}>=0 and ${t.unused}>=0 and ${t.consumed}+${t.unused}<=${t.pending}`,
    ),
  ],
);
export const stockResolutionEvents = pgTable(
  "stock_resolution_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    operationId: uuid("operation_id")
      .notNull()
      .references(() => stockOperations.id),
    resolutionLineId: uuid("resolution_line_id")
      .notNull()
      .references(() => stockResolutionLines.id),
    consumed: numeric("consumed", { precision: 18, scale: 6 }).notNull(),
    unused: numeric("unused", { precision: 18, scale: 6 }).notNull(),
    reason: text("reason").notNull(),
  },
  (t) => [
    check(
      "stock_resolution_event_positive",
      sql`${t.consumed}>=0 and ${t.unused}>=0 and ${t.consumed}+${t.unused}>0`,
    ),
  ],
);
