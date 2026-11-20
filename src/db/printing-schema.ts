import {
  boolean,
  check,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { branches } from "./branch-schema";
import { user } from "./auth-schema";
import { saleOrders } from "./sales-schema";
import type { PrintTicket } from "@/modules/printing/types";
const at = (name: string) =>
  timestamp(name, { withTimezone: true, mode: "date" });
export const printingSettings = pgTable("printing_settings", {
  branchId: uuid("branch_id")
    .primaryKey()
    .references(() => branches.id),
  enabled: boolean("enabled").notNull().default(false),
  revision: integer("revision").notNull().default(1),
  printerName: text("printer_name").notNull(),
  updatedBy: text("updated_by")
    .notNull()
    .references(() => user.id),
  updatedAt: at("updated_at").notNull().defaultNow(),
});
export const printingConnectors = pgTable(
  "printing_connectors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    tokenHash: text("token_hash").notNull(),
    name: text("name").notNull(),
    printerName: text("printer_name").notNull(),
    revokedAt: at("revoked_at"),
    createdAt: at("created_at").notNull().defaultNow(),
    lastSeenAt: at("last_seen_at"),
    instanceId: uuid("instance_id"),
    printerStatus: text("printer_status").notNull().default("unknown"),
    printerMessage: text("printer_message"),
  },
  (t) => [
    uniqueIndex("printing_connector_hash").on(t.tokenHash),
    uniqueIndex("printing_connector_branch_key").on(t.id, t.branchId),
    uniqueIndex("printing_connector_active")
      .on(t.branchId)
      .where(sql`${t.revokedAt} is null`),
  ],
);
export const printingPairings = pgTable(
  "printing_pairings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    codeHash: text("code_hash").notNull(),
    expiresAt: at("expires_at").notNull(),
    usedAt: at("used_at"),
    createdBy: text("created_by")
      .notNull()
      .references(() => user.id),
  },
  (t) => [uniqueIndex("printing_pair_code").on(t.codeHash)],
);
export const printTickets = pgTable(
  "print_tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    orderId: uuid("order_id"),
    stationKey: text("station_key").notNull(),
    snapshot: jsonb("snapshot").$type<PrintTicket>().notNull(),
    createdAt: at("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("print_ticket_station").on(t.orderId, t.stationKey),
    uniqueIndex("print_ticket_branch_key").on(t.id, t.branchId),
    foreignKey({
      columns: [t.orderId, t.branchId],
      foreignColumns: [saleOrders.id, saleOrders.branchId],
    }),
  ],
);
export const printJobs = pgTable(
  "print_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    ticketId: uuid("ticket_id").notNull(),
    settingsRevision: integer("settings_revision").notNull().default(1),
    kind: text("kind").notNull(),
    copyNumber: integer("copy_number").notNull().default(0),
    eventKey: text("event_key").notNull(),
    state: text("state").notNull().default("pending"),
    requestedBy: text("requested_by")
      .notNull()
      .references(() => user.id),
    reason: text("reason"),
    createdAt: at("created_at").notNull().defaultNow(),
    sentAt: at("sent_at"),
    connectorId: uuid("connector_id"),
    leaseToken: text("lease_token"),
    leaseExpiresAt: at("lease_expires_at"),
    instanceId: uuid("instance_id"),
    spoolJobId: integer("spool_job_id"),
    spoolState: text("spool_state").notNull().default("unknown"),
    error: text("error"),
    change: text("change"),
    reviewedAt: at("reviewed_at"),
    reportOutcome: text("report_outcome"),
  },
  (t) => [
    uniqueIndex("print_job_event").on(t.branchId, t.eventKey),
    index("print_dispatch_queue").on(t.branchId, t.state, t.createdAt),
    foreignKey({
      columns: [t.ticketId, t.branchId],
      foreignColumns: [printTickets.id, printTickets.branchId],
    }),
    foreignKey({
      columns: [t.connectorId, t.branchId],
      foreignColumns: [printingConnectors.id, printingConnectors.branchId],
    }),
    check(
      "print_job_state",
      sql`${t.state} in ('pending','leased','sending','sent','error','uncertain','review','cancelled')`,
    ),
    check(
      "print_job_kind",
      sql`${t.kind} in ('original','copy','historical','cancellation','change','test')`,
    ),
  ],
);
export const printingRequests = pgTable("printing_requests", {
  requestId: uuid("request_id").primaryKey(),
  branchId: uuid("branch_id")
    .notNull()
    .references(() => branches.id),
  actorId: text("actor_id")
    .notNull()
    .references(() => user.id),
  fingerprint: text("fingerprint").notNull(),
  result: jsonb("result").notNull(),
});
