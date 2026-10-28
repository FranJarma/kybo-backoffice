import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  numeric,
  timestamp,
  date,
  jsonb,
  primaryKey,
  uniqueIndex,
  index,
  check,
  foreignKey,
} from "drizzle-orm/pg-core";
import { branches } from "./branch-schema";
import { user } from "./auth-schema";
import type { CashPosnetClose } from "@/modules/cash/types";
const money = (name: string) => numeric(name, { precision: 14, scale: 2 });
const at = (name: string) => timestamp(name, { withTimezone: true });
export const cashSettings = pgTable(
  "cash_settings",
  {
    branchId: uuid("branch_id")
      .primaryKey()
      .references(() => branches.id),
    closeTime: text("close_time").notNull().default("23:00"),
    targetFund: money("target_fund"),
    activatedAt: at("activated_at"),
    revision: integer("revision").notNull().default(1),
    updatedBy: text("updated_by").references(() => user.id),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "cash_settings_time",
      sql`${t.closeTime} ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'`,
    ),
    check(
      "cash_settings_fund",
      sql`${t.targetFund} is null or ${t.targetFund} >= 0`,
    ),
  ],
);
export const cashPermissions = pgTable(
  "cash_permissions",
  {
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    canOpen: boolean("can_open").notNull().default(false),
    canClose: boolean("can_close").notNull().default(false),
    canExpense: boolean("can_expense").notNull().default(false),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.branchId, t.userId] })],
);
export const cashSessions = pgTable(
  "cash_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    businessDate: date("business_date").notNull(),
    state: text("state").$type<"open" | "closed">().notNull().default("open"),
    openingCash: money("opening_cash").notNull(),
    openingReason: text("opening_reason").notNull().default(""),
    closeTime: text("close_time").notNull(),
    targetFund: money("target_fund"),
    timeZone: text("time_zone").notNull(),
    openedBy: text("opened_by")
      .notNull()
      .references(() => user.id),
    openedAt: at("opened_at").notNull().defaultNow(),
    revision: integer("revision").notNull().default(1),
    closedAt: at("closed_at"),
    closedBy: text("closed_by").references(() => user.id),
    expectedClosing: money("expected_closing"),
    counted: money("counted"),
    withdrawal: money("withdrawal"),
    fund: money("fund"),
    difference: money("difference"),
    reason: text("reason"),
    posnet: jsonb("posnet").$type<CashPosnetClose>(),
    posnetReview: jsonb("posnet_review").$type<CashPosnetClose>(),
    reviewRequired: boolean("review_required").notNull().default(false),
    reviewedAt: at("reviewed_at"),
    reviewedBy: text("reviewed_by").references(() => user.id),
    reviewNote: text("review_note"),
  },
  (t) => [
    uniqueIndex("cash_session_branch").on(t.id, t.branchId),
    uniqueIndex("cash_one_open")
      .on(t.branchId)
      .where(sql`${t.state}='open'`),
    index("cash_session_history").on(t.branchId, t.openedAt),
    check("cash_session_state", sql`${t.state} in ('open','closed')`),
    check(
      "cash_session_money",
      sql`${t.openingCash}>=0 and (${t.targetFund} is null or ${t.targetFund}>=0)`,
    ),
    check(
      "cash_closed_values",
      sql`${t.state}='open' or (${t.closedAt} is not null and ${t.closedBy} is not null and ${t.expectedClosing} is not null and ${t.counted} is not null and ${t.withdrawal} is not null and ${t.fund} is not null and ${t.difference} is not null and ${t.counted}>=0 and ${t.withdrawal}>=0 and ${t.withdrawal}<=${t.counted} and ${t.fund}=${t.counted}-${t.withdrawal} and ${t.difference}=${t.counted}-${t.expectedClosing} and ${t.posnet} is not null)`,
    ),
  ],
);
export const cashMovements = pgTable(
  "cash_movements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").notNull(),
    branchId: uuid("branch_id").notNull(),
    kind: text("kind").notNull(),
    amount: money("amount").notNull(),
    methodKind: text("method_kind").notNull(),
    methodName: text("method_name").notNull(),
    concept: text("concept").notNull(),
    reference: text("reference"),
    sourceType: text("source_type").notNull(),
    sourceId: uuid("source_id").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    createdAt: at("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.sessionId, t.branchId],
      foreignColumns: [cashSessions.id, cashSessions.branchId],
    }),
    uniqueIndex("cash_movement_source").on(t.sourceType, t.sourceId),
    index("cash_movement_session").on(t.sessionId, t.createdAt),
    check(
      "cash_movement_kind",
      sql`${t.kind} in ('opening','collection','refund','expense','withdrawal','supplier','advance')`,
    ),
  ],
);
export const cashExpenses = pgTable(
  "cash_expenses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    businessDate: date("business_date").notNull(),
    category: text("category").notNull(),
    concept: text("concept").notNull(),
    amount: money("amount").notNull(),
    source: text("source").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    createdAt: at("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.sessionId, t.branchId],
      foreignColumns: [cashSessions.id, cashSessions.branchId],
    }),
    index("cash_expense_month").on(t.branchId, t.businessDate),
    check("cash_expense_positive", sql`${t.amount}>0`),
    check("cash_expense_source", sql`${t.source} in ('cash','external')`),
  ],
);
export const cashPhotos = pgTable(
  "cash_photos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id").notNull(),
    sessionId: uuid("session_id").notNull(),
    creatorId: text("creator_id")
      .notNull()
      .references(() => user.id),
    storageKey: text("storage_key").notNull().unique(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    bytes: integer("bytes").notNull(),
    claimedAt: at("claimed_at"),
    createdAt: at("created_at").notNull().defaultNow(),
  },
  (t) => [
    foreignKey({
      columns: [t.sessionId, t.branchId],
      foreignColumns: [cashSessions.id, cashSessions.branchId],
    }),
    index("cash_photo_session").on(t.sessionId),
  ],
);
