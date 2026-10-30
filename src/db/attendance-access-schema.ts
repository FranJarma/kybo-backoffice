import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { user, session } from "./auth-schema";
import { branches } from "./branch-schema";
const at = (name: string) => timestamp(name, { withTimezone: true });
export const attendanceQrAttempts = pgTable(
  "attendance_qr_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    requestId: uuid("request_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    sessionId: text("session_id")
      .notNull()
      .references(() => session.id, { onDelete: "cascade" }),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    settingsRevision: integer("settings_revision").notNull(),
    fingerprint: text("fingerprint").notNull(),
    createdAt: at("created_at").notNull(),
    expiresAt: at("expires_at").notNull(),
    consumedAt: at("consumed_at"),
    operationRequestId: uuid("operation_request_id"),
  },
  (t) => [
    uniqueIndex("attendance_qr_attempt_request").on(t.requestId),
    index("attendance_qr_attempt_user").on(t.userId, t.createdAt),
    check(
      "attendance_qr_attempt_lifetime",
      sql`${t.expiresAt}>${t.createdAt} and ${t.expiresAt}<=${t.createdAt}+interval '2 minutes' and ${t.settingsRevision}>0`,
    ),
  ],
);
