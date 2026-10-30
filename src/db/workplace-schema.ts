import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { session, user } from "./auth-schema";
import { branches } from "./branch-schema";
import { attendanceAssignments } from "./attendance-schema";
import { preparationStations } from "./preparation-schema";
const at = (name: string) => timestamp(name, { withTimezone: true });

/** The marker survives disabling and always distinguishes shared from personal accounts. */
export const workplaceStoreAccounts = pgTable("workplace_store_accounts", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "restrict" }),
  branchId: uuid("branch_id")
    .notNull()
    .references(() => branches.id),
  enabled: boolean("enabled").notNull().default(true),
  createdBy: text("created_by")
    .notNull()
    .references(() => user.id),
  createdAt: at("created_at").notNull().defaultNow(),
  updatedAt: at("updated_at").notNull().defaultNow(),
});
export const workplaceManagementAuthorizations = pgTable(
  "workplace_management_authorizations",
  {
    id: uuid("id").primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    sessionId: text("session_id")
      .notNull()
      .references(() => session.id, { onDelete: "cascade" }),
    storeUserId: text("store_user_id")
      .notNull()
      .references(() => user.id),
    managerUserId: text("manager_user_id")
      .notNull()
      .references(() => user.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    credentialVersion: text("credential_version").notNull(),
    createdAt: at("created_at").notNull(),
    expiresAt: at("expires_at").notNull(),
    revokedAt: at("revoked_at"),
    savedRequestId: uuid("saved_request_id"),
    savedFingerprint: text("saved_fingerprint"),
    savedResult: jsonb("saved_result").$type<Record<string, unknown>>(),
  },
  (t) => [
    index("workplace_authorization_session").on(t.sessionId),
    index("workplace_authorization_manager").on(t.managerUserId),
    check(
      "workplace_authorization_lifetime",
      sql`${t.expiresAt}>${t.createdAt} and ${t.expiresAt}<=${t.createdAt}+interval '10 minutes'`,
    ),
  ],
);
export const workplaceManagementLimits = pgTable(
  "workplace_management_limits",
  {
    storeUserId: text("store_user_id")
      .primaryKey()
      .references(() => user.id, { onDelete: "cascade" }),
    // Diagnostic reference only: ending a POS session must not reset its throttle.
    sessionId: text("session_id").notNull(),
    failures: integer("failures").notNull().default(0),
    windowAt: at("window_at").notNull(),
    blockedUntil: at("blocked_until"),
  },
);
export const workplacePlans = pgTable(
  "workplace_plans",
  {
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    businessDate: text("business_date").notNull(),
    revision: integer("revision").notNull().default(0),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.branchId, t.businessDate] })],
);
export const workplaceStationAssignments = pgTable(
  "workplace_station_assignments",
  {
    assignmentId: uuid("assignment_id")
      .primaryKey()
      .references(() => attendanceAssignments.id),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    stationId: uuid("station_id"),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("workplace_station_branch").on(t.branchId, t.stationId),
    foreignKey({
      columns: [t.stationId, t.branchId],
      foreignColumns: [preparationStations.id, preparationStations.branchId],
    }),
  ],
);
