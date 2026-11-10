import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  boolean,
  timestamp,
  uuid,
  integer,
  check,
  index,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
const at = (name: string) => timestamp(name, { withTimezone: true });
export const passwordRecoveryContacts = pgTable(
  "password_recovery_contacts",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    phone: text("phone").unique(),
    enabled: boolean("enabled").notNull().default(false),
    version: uuid("version").notNull().defaultRandom(),
    confirmedAt: at("confirmed_at"),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "recovery_phone_format",
      sql`${t.phone} is null or ${t.phone} ~ '^[+][1-9][0-9]{7,14}$'`,
    ),
    check(
      "recovery_contact_enabled",
      sql`not ${t.enabled} or (${t.phone} is not null and ${t.confirmedAt} is not null)`,
    ),
  ],
);
export const passwordRecoveryChallenges = pgTable(
  "password_recovery_challenges",
  {
    id: uuid("id").primaryKey(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    contactVersion: uuid("contact_version"),
    subjectVersion: text("subject_version"),
    codeDigest: text("code_digest").notNull(),
    grantDigest: text("grant_digest"),
    attempts: integer("attempts").notNull().default(0),
    state: text("state").notNull().default("queued"),
    createdAt: at("created_at").notNull(),
    expiresAt: at("expires_at").notNull(),
    grantExpiresAt: at("grant_expires_at"),
  },
  (t) => [
    index("recovery_challenge_user_created").on(t.userId, t.createdAt),
    index("recovery_challenge_expiry").on(t.expiresAt),
    index("recovery_challenge_created").on(t.createdAt),
    check("recovery_challenge_attempts", sql`${t.attempts} between 0 and 5`),
    check(
      "recovery_challenge_state",
      sql`${t.state} in ('queued','sending','sent','failed','verified','consumed','invalid')`,
    ),
  ],
);
export const passwordRecoveryLimits = pgTable(
  "password_recovery_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    windowAt: at("window_at").notNull(),
    expiresAt: at("expires_at").notNull(),
  },
  (t) => [
    index("recovery_limit_expiry").on(t.expiresAt),
    check("recovery_limit_count", sql`${t.count}>0`),
  ],
);
