import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  date,
  jsonb,
  timestamp,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { branches } from "./branch-schema";
import { user } from "./auth-schema";
import type { ExpenseEntry } from "@/modules/overheads/types";
export const expensePeriods = pgTable(
  "expense_periods",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    month: date("month").notNull(),
    expectedUnits: integer("expected_units"),
    iibbRate: numeric("iibb_rate", { precision: 5, scale: 2 }),
    entries: jsonb("entries").$type<ExpenseEntry[]>().notNull(),
    revision: integer("revision").notNull().default(1),
    status: text("status").notNull().default("draft"),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("expense_period_branch_month").on(t.branchId, t.month),
    check("expense_period_month", sql`extract(day from ${t.month}) = 1`),
    check(
      "expense_period_units",
      sql`${t.expectedUnits} is null or ${t.expectedUnits} between 1 and 1000000000`,
    ),
    check("expense_period_revision", sql`${t.revision} > 0`),
    check("expense_period_iibb_rate", sql`${t.iibbRate} between 0 and 100`),
    check("expense_period_status", sql`${t.status} in ('draft','closed')`),
    check("expense_period_entries", sql`jsonb_typeof(${t.entries}) = 'array'`),
  ],
);
export const expenseClosures = pgTable(
  "expense_closures",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    periodId: uuid("period_id")
      .notNull()
      .references(() => expensePeriods.id),
    sequence: integer("sequence").notNull(),
    entries: jsonb("entries").$type<ExpenseEntry[]>().notNull(),
    expectedUnits: integer("expected_units"),
    actualUnits: integer("actual_units").notNull(),
    iibbRate: numeric("iibb_rate", { precision: 5, scale: 2 }),
    reason: text("reason").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    closedAt: timestamp("closed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("expense_close_sequence").on(t.periodId, t.sequence),
    check(
      "expense_close_units",
      sql`${t.actualUnits} >= 0 and (${t.expectedUnits} is null or ${t.expectedUnits} between 1 and 1000000000)`,
    ),
    check("expense_close_sequence_positive", sql`${t.sequence} > 0`),
    check("expense_close_iibb_rate", sql`${t.iibbRate} between 0 and 100`),
    check("expense_close_entries", sql`jsonb_typeof(${t.entries}) = 'array'`),
  ],
);
