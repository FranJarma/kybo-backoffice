import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  boolean,
  integer,
  doublePrecision,
  timestamp,
  date,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
  check,
  bigserial,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { branches } from "./branch-schema";
import { identityCredentials } from "./identity-schema";
import type { PunchKind } from "@/modules/attendance/rules";
const at = (name: string) => timestamp(name, { withTimezone: true });
export const attendanceSettings = pgTable(
  "attendance_settings",
  {
    branchId: uuid("branch_id")
      .primaryKey()
      .references(() => branches.id),
    enabled: boolean("enabled").notNull().default(false),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    radiusMeters: integer("radius_meters").notNull().default(100),
    maxAccuracyMeters: integer("max_accuracy_meters").notNull().default(40),
    codeValidityMinutes: integer("code_validity_minutes").notNull().default(10),
    requireStepUp: boolean("require_step_up").notNull().default(false),
    revision: integer("revision").notNull().default(1),
    updatedBy: text("updated_by").references(() => user.id),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (t) => [
    check(
      "attendance_policy_values",
      sql`${t.radiusMeters} between 1 and 10000 and ${t.maxAccuracyMeters} between 1 and 1000 and ${t.codeValidityMinutes} between 1 and 1440 and ${t.revision}>0`,
    ),
    check(
      "attendance_coordinates",
      sql`(${t.latitude} is null or ${t.latitude} between -90 and 90) and (${t.longitude} is null or ${t.longitude} between -180 and 180)`,
    ),
    check(
      "attendance_enabled_location",
      sql`not ${t.enabled} or (${t.latitude} is not null and ${t.longitude} is not null and ${t.maxAccuracyMeters} <= ${t.radiusMeters})`,
    ),
  ],
);
export const attendanceParticipants = pgTable(
  "attendance_participants",
  {
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    enabled: boolean("enabled").notNull().default(false),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.branchId, t.userId] })],
);
export const attendanceShifts = pgTable(
  "attendance_shifts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    name: text("name").notNull(),
    start: text("start").notNull(),
    end: text("end").notNull(),
    overnight: boolean("overnight").notNull().default(false),
    pauseMinutes: integer("pause_minutes").notNull().default(30),
    active: boolean("active").notNull().default(true),
    revision: integer("revision").notNull().default(1),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("attendance_shift_branch").on(t.branchId),
    check(
      "attendance_shift_pause",
      sql`${t.pauseMinutes}>=0 and ${t.pauseMinutes}<1440`,
    ),
  ],
);
export const attendanceAssignments = pgTable(
  "attendance_assignments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    businessDate: date("business_date").notNull(),
    kind: text("kind").$type<"work" | "off">().notNull(),
    shiftId: uuid("shift_id").references(() => attendanceShifts.id),
    name: text("name").notNull(),
    startsAt: at("starts_at"),
    endsAt: at("ends_at"),
    pauseMinutes: integer("pause_minutes").notNull().default(0),
    timeZone: text("time_zone").notNull(),
    revision: integer("revision").notNull().default(1),
    reason: text("reason").notNull().default(""),
    canceledAt: at("canceled_at"),
    updatedBy: text("updated_by")
      .notNull()
      .references(() => user.id),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (t) => [
    index("attendance_assignment_lookup").on(
      t.branchId,
      t.businessDate,
      t.userId,
    ),
    uniqueIndex("attendance_assignment_start")
      .on(t.userId, t.startsAt)
      .where(sql`${t.canceledAt} is null and ${t.kind}='work'`),
    uniqueIndex("attendance_one_off")
      .on(t.branchId, t.userId, t.businessDate)
      .where(sql`${t.canceledAt} is null and ${t.kind}='off'`),
    check(
      "attendance_assignment_window",
      sql`(${t.kind}='off' and ${t.startsAt} is null and ${t.endsAt} is null and ${t.pauseMinutes}=0) or (${t.kind}='work' and ${t.startsAt} is not null and ${t.endsAt}>${t.startsAt} and ${t.endsAt}<${t.startsAt}+interval '24 hours' and ${t.pauseMinutes}>=0 and ${t.pauseMinutes}*interval '1 minute'<${t.endsAt}-${t.startsAt})`,
    ),
  ],
);
export const attendanceManualRequests = pgTable(
  "attendance_manual_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    kind: text("kind").$type<PunchKind>().notNull(),
    occurredAt: at("occurred_at").notNull(),
    assignmentId: uuid("assignment_id").references(
      () => attendanceAssignments.id,
    ),
    reason: text("reason").notNull(),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => user.id),
    requestedAt: at("requested_at").notNull().defaultNow(),
    status: text("status")
      .$type<"pending" | "approved" | "rejected" | "used" | "locked">()
      .notNull()
      .default("pending"),
    approvedBy: text("approved_by").references(() => user.id),
    decidedAt: at("decided_at"),
    decisionReason: text("decision_reason"),
    validityMinutes: integer("validity_minutes"),
    expiresAt: at("expires_at"),
    codeHash: text("code_hash"),
    codeCipher: text("code_cipher"),
    failedAttempts: integer("failed_attempts").notNull().default(0),
    usedAt: at("used_at"),
    usedBy: text("used_by").references(() => user.id),
  },
  (t) => [
    index("attendance_manual_branch").on(t.branchId, t.requestedAt),
    check(
      "attendance_manual_kind",
      sql`${t.kind} in ('entry','pause','resume','exit')`,
    ),
    check(
      "attendance_manual_state",
      sql`${t.status} in ('pending','approved','rejected','used','locked') and ${t.failedAttempts} between 0 and 5`,
    ),
    check(
      "attendance_manual_separate_approval",
      sql`${t.approvedBy} is null or ${t.approvedBy}<>${t.requestedBy}`,
    ),
    check(
      "attendance_manual_approved_code",
      sql`${t.status}<>'approved' or (${t.approvedBy} is not null and ${t.decidedAt} is not null and ${t.expiresAt}>${t.decidedAt} and ${t.validityMinutes}>0 and ${t.codeHash} is not null and ${t.codeCipher} is not null)`,
    ),
  ],
);
export const attendanceEvents = pgTable(
  "attendance_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sequence: bigserial("sequence", { mode: "number" }).notNull(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    kind: text("kind").$type<PunchKind>().notNull(),
    occurredAt: at("occurred_at").notNull(),
    recordedAt: at("recorded_at").notNull().defaultNow(),
    businessDate: date("business_date").notNull(),
    source: text("source").$type<"phone" | "manual">().notNull(),
    assignmentId: uuid("assignment_id").references(
      () => attendanceAssignments.id,
    ),
    credentialId: text("credential_id").references(
      () => identityCredentials.id,
    ),
    manualRequestId: uuid("manual_request_id").references(
      () => attendanceManualRequests.id,
    ),
    evidence: jsonb("evidence").$type<Record<string, unknown>>(),
    recordedBy: text("recorded_by")
      .notNull()
      .references(() => user.id),
  },
  (t) => [
    index("attendance_event_user").on(t.userId, t.occurredAt, t.sequence),
    index("attendance_event_branch").on(t.branchId, t.businessDate),
    check(
      "attendance_event_kind",
      sql`${t.kind} in ('entry','pause','resume','exit')`,
    ),
    check(
      "attendance_event_evidence",
      sql`(${t.source}='phone' and ${t.credentialId} is not null and ${t.evidence} is not null and ${t.manualRequestId} is null) or (${t.source}='manual' and ${t.manualRequestId} is not null and ${t.credentialId} is null and ${t.evidence} is null)`,
    ),
  ],
);
export const attendanceCorrections = pgTable(
  "attendance_corrections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    changes: jsonb("changes")
      .$type<{ eventId: string; occurredAt: string | null }[]>()
      .notNull(),
    originalHash: text("original_hash").notNull(),
    reason: text("reason").notNull(),
    status: text("status")
      .$type<"pending" | "approved" | "rejected">()
      .notNull()
      .default("pending"),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => user.id),
    requestedAt: at("requested_at").notNull().defaultNow(),
    resolvedBy: text("resolved_by").references(() => user.id),
    resolvedAt: at("resolved_at"),
    resolutionReason: text("resolution_reason"),
  },
  (t) => [
    index("attendance_correction_user").on(t.userId, t.resolvedAt),
    check(
      "attendance_correction_state",
      sql`${t.status} in ('pending','approved','rejected')`,
    ),
  ],
);
export const attendanceOperations = pgTable("attendance_operations", {
  requestId: uuid("request_id").primaryKey(),
  actorId: text("actor_id")
    .notNull()
    .references(() => user.id),
  branchId: uuid("branch_id")
    .notNull()
    .references(() => branches.id),
  fingerprint: text("fingerprint").notNull(),
  result: jsonb("result").$type<Record<string, unknown>>().notNull(),
  createdAt: at("created_at").notNull().defaultNow(),
});
export const attendanceEventLinks = pgTable("attendance_event_links", {
  entryId: uuid("entry_id")
    .primaryKey()
    .references(() => attendanceEvents.id),
  assignmentId: uuid("assignment_id")
    .notNull()
    .references(() => attendanceAssignments.id),
  reason: text("reason").notNull(),
  linkedBy: text("linked_by")
    .notNull()
    .references(() => user.id),
  linkedAt: at("linked_at").notNull().defaultNow(),
});
