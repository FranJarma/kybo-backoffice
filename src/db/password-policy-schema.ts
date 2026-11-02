import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  uuid,
  check,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
const at = (name: string) => timestamp(name, { withTimezone: true });
export const userPasswordPolicies = pgTable(
  "user_password_policies",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id),
    required: boolean("required").notNull().default(false),
    generation: uuid("generation").notNull().defaultRandom(),
    credentialVersion: text("credential_version").notNull(),
    issuedBy: text("issued_by")
      .notNull()
      .references(() => user.id),
    issuedAt: at("issued_at").notNull().defaultNow(),
    firstLoginAt: at("first_login_at"),
    expiresAt: at("expires_at"),
    completedAt: at("completed_at"),
    failures: integer("failures").notNull().default(0),
    failureWindowAt: at("failure_window_at"),
    blockedUntil: at("blocked_until"),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "password_policy_deadline",
      sql`(${t.firstLoginAt} is null and ${t.expiresAt} is null) or (${t.firstLoginAt} is not null and ${t.expiresAt} is not null and ${t.expiresAt}=${t.firstLoginAt}+interval '24 hours')`,
    ),
    check("password_policy_failures", sql`${t.failures}>=0`),
    check(
      "password_policy_completion",
      sql`not ${t.required} or ${t.completedAt} is null`,
    ),
  ],
);
