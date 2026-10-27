import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  integer,
  numeric,
  boolean,
  text,
  timestamp,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { branches } from "./branch-schema";
import { items } from "./item-schema";
import { user } from "./auth-schema";
export const supplyAlertPolicies = pgTable(
  "supply_alert_policies",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    itemId: uuid("item_id")
      .notNull()
      .references(() => items.id),
    dailyConsumption: numeric("daily_consumption", { precision: 18, scale: 6 }),
    leadDays: integer("lead_days").notNull().default(7),
    safetyDays: integer("safety_days").notNull().default(3),
    targetDays: integer("target_days").notNull().default(17),
    enabled: boolean("enabled").notNull().default(true),
    revision: integer("revision").notNull().default(1),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("supply_alert_branch_item").on(t.branchId, t.itemId),
    check(
      "supply_alert_consumption",
      sql`${t.dailyConsumption} is null or ${t.dailyConsumption} >= 0`,
    ),
    check(
      "supply_alert_days",
      sql`${t.leadDays} between 1 and 364 and ${t.safetyDays} between 0 and 364 and ${t.targetDays} between 1 and 365 and ${t.targetDays} > ${t.leadDays} + ${t.safetyDays}`,
    ),
    check("supply_alert_revision", sql`${t.revision} > 0`),
  ],
);
