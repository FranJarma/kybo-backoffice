import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  check,
  uniqueIndex,
  foreignKey,
} from "drizzle-orm/pg-core";
import { branches } from "./branch-schema";
import { user } from "./auth-schema";
import { purchaseReceipts } from "./inventory-schema";
import { saleLines } from "./sales-schema";
import { productionOrders } from "./production-order-schema";
import { stockTransfers } from "./transfer-schema";
const fields = () => ({
  id: uuid("id").defaultRandom().primaryKey(),
  branchId: uuid("branch_id")
    .notNull()
    .references(() => branches.id),
  actorId: text("actor_id")
    .notNull()
    .references(() => user.id),
  reason: text("reason").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const stockAdjustments = pgTable(
  "stock_adjustments",
  { ...fields(), kind: text("kind").notNull() },
  (t) => [
    uniqueIndex("stock_adjustment_branch").on(t.id, t.branchId),
    check(
      "stock_adjustment_kind",
      sql`${t.kind} in ('opening','count','waste')`,
    ),
  ],
);
export const internalUses = pgTable("internal_uses", fields(), (t) => [
  uniqueIndex("internal_use_branch").on(t.id, t.branchId),
]);
export const stockReturns = pgTable(
  "stock_returns",
  {
    ...fields(),
    saleLineId: uuid("sale_line_id")
      .notNull()
      .references(() => saleLines.id),
  },
  (t) => [
    uniqueIndex("stock_return_branch").on(t.id, t.branchId),
    foreignKey({
      name: "stock_return_sale_branch",
      columns: [t.saleLineId, t.branchId],
      foreignColumns: [saleLines.id, saleLines.branchId],
    }),
  ],
);
export const stockDocuments = pgTable(
  "stock_documents",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    kind: text("kind").notNull(),
    receiptId: uuid("receipt_id").references(() => purchaseReceipts.id),
    saleLineId: uuid("sale_line_id").references(() => saleLines.id),
    productionOrderId: uuid("production_order_id"),
    transferId: uuid("transfer_id").references(() => stockTransfers.id),
    adjustmentId: uuid("adjustment_id"),
    internalUseId: uuid("internal_use_id"),
    returnId: uuid("return_id"),
  },
  (t) => [
    uniqueIndex("stock_document_branch").on(t.id, t.branchId),
    foreignKey({
      columns: [t.receiptId, t.branchId],
      foreignColumns: [purchaseReceipts.id, purchaseReceipts.branchId],
    }),
    foreignKey({
      columns: [t.saleLineId, t.branchId],
      foreignColumns: [saleLines.id, saleLines.branchId],
    }),
    foreignKey({
      columns: [t.productionOrderId, t.branchId],
      foreignColumns: [productionOrders.id, productionOrders.branchId],
    }),
    foreignKey({
      columns: [t.adjustmentId, t.branchId],
      foreignColumns: [stockAdjustments.id, stockAdjustments.branchId],
    }),
    foreignKey({
      columns: [t.internalUseId, t.branchId],
      foreignColumns: [internalUses.id, internalUses.branchId],
    }),
    foreignKey({
      columns: [t.returnId, t.branchId],
      foreignColumns: [stockReturns.id, stockReturns.branchId],
    }),
    check(
      "stock_document_one_origin",
      sql`num_nonnulls(${t.receiptId},${t.saleLineId},${t.productionOrderId},${t.transferId},${t.adjustmentId},${t.internalUseId},${t.returnId})=1`,
    ),
    check(
      "stock_document_origin_kind",
      sql`(${t.kind}='receipt' and ${t.receiptId} is not null) or (${t.kind}='sale' and ${t.saleLineId} is not null) or (${t.kind}='production' and ${t.productionOrderId} is not null) or (${t.kind}='transfer' and ${t.transferId} is not null) or (${t.kind}='adjustment' and ${t.adjustmentId} is not null) or (${t.kind}='internal_use' and ${t.internalUseId} is not null) or (${t.kind}='return' and ${t.returnId} is not null)`,
    ),
  ],
);
