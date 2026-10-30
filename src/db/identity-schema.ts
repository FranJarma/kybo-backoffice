import {
  pgTable,
  text,
  uuid,
  boolean,
  bigint,
  timestamp,
  jsonb,
  index,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user } from "./auth-schema";
import { branches } from "./branch-schema";
const at = (name: string) => timestamp(name, { withTimezone: true });
export const identityCredentials = pgTable(
  "identity_credentials",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    rpId: text("rp_id").notNull(),
    publicKey: text("public_key").notNull(),
    counter: bigint("counter", { mode: "number" }).notNull().default(0),
    transports: jsonb("transports").$type<string[]>().notNull().default([]),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    name: text("name").notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
    lastUsedAt: at("last_used_at"),
    revokedAt: at("revoked_at"),
    revokedBy: text("revoked_by").references(() => user.id),
  },
  (t) => [
    index("identity_credentials_user").on(t.userId),
    check("identity_counter_valid", sql`${t.counter} >= 0`),
  ],
);
export const identityChallenges = pgTable(
  "identity_challenges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    kind: text("kind").$type<"registration" | "verification">().notNull(),
    challenge: text("challenge").notNull(),
    rpId: text("rp_id").notNull(),
    origin: text("origin").notNull(),
    binding: jsonb("binding").$type<Record<string, unknown>>().notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
    expiresAt: at("expires_at").notNull(),
    consumedAt: at("consumed_at"),
  },
  (t) => [
    index("identity_challenge_expiry").on(t.userId, t.expiresAt),
    check(
      "identity_challenge_kind",
      sql`${t.kind} in ('registration','verification')`,
    ),
  ],
);
export const identityConfirmations = pgTable(
  "identity_confirmations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    credentialId: text("credential_id")
      .notNull()
      .references(() => identityCredentials.id),
    action: text("action").notNull(),
    requestId: uuid("request_id").notNull(),
    payloadHash: text("payload_hash").notNull(),
    verifiedAt: at("verified_at").notNull(),
    expiresAt: at("expires_at").notNull(),
    consumedAt: at("consumed_at"),
    operationId: uuid("operation_id"),
  },
  (t) => [index("identity_confirmation_expiry").on(t.userId, t.expiresAt)],
);
export const identityEnrollmentLimits = pgTable("identity_enrollment_limits", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id),
  failures: bigint("failures", { mode: "number" }).notNull().default(0),
  windowAt: at("window_at").notNull(),
  blockedUntil: at("blocked_until"),
});
