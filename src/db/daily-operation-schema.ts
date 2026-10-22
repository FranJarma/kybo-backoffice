import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  numeric,
  timestamp,
  uniqueIndex,
  index,
  foreignKey,
  primaryKey,
  check,
} from "drizzle-orm/pg-core";
import { branches, locations } from "./branch-schema";
import { items } from "./item-schema";
import { user } from "./auth-schema";
import type {
  TaskKind,
  TaskState,
  Urgency,
} from "@/modules/daily-operations/types";
const at = (name: string) => timestamp(name, { withTimezone: true });
export const dailyOperationTasks = pgTable(
  "daily_operation_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    kind: text("kind").$type<TaskKind>().notNull(),
    state: text("state").$type<TaskState>().notNull().default("pending"),
    urgency: text("urgency").$type<Urgency>().notNull().default("scheduled"),
    title: text("title").notNull(),
    reason: text("reason").notNull().default(""),
    revision: integer("revision").notNull().default(1),
    needKey: text("need_key"),
    documentId: uuid("document_id"),
    documentRole: text("document_role").notNull().default("execute"),
    documentRevision: integer("document_revision"),
    itemId: uuid("item_id").references(() => items.id),
    quantity: numeric("quantity", { precision: 18, scale: 6 }),
    unit: text("unit"),
    locationId: uuid("location_id"),
    originLocationId: uuid("origin_location_id"),
    assignedTo: text("assigned_to").references(() => user.id),
    dueAt: at("due_at"),
    createdAt: at("created_at").notNull().defaultNow(),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("daily_operation_identity").on(t.id, t.branchId),
    uniqueIndex("daily_operation_need")
      .on(t.branchId, t.needKey)
      .where(
        sql`${t.needKey} is not null and ${t.state} not in ('done','cancelled','superseded')`,
      ),
    uniqueIndex("daily_operation_document")
      .on(t.branchId, t.kind, t.documentId, t.documentRole)
      .where(sql`${t.documentId} is not null`),
    index("daily_operation_queue").on(t.branchId, t.state, t.dueAt),
    index("daily_operation_assignee").on(t.branchId, t.assignedTo, t.state),
    foreignKey({
      columns: [t.locationId, t.branchId],
      foreignColumns: [locations.id, locations.branchId],
    }),
    foreignKey({
      columns: [t.originLocationId, t.branchId],
      foreignColumns: [locations.id, locations.branchId],
    }),
    check(
      "daily_operation_state",
      sql`${t.state} in ('pending','in_progress','blocked','awaiting_review','done','cancelled','superseded')`,
    ),
  ],
);
export const dailyOperationEvents = pgTable(
  "daily_operation_task_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    taskId: uuid("task_id").notNull(),
    revision: integer("revision").notNull(),
    action: text("action").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    reason: text("reason").notNull().default(""),
    createdAt: at("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("daily_operation_event_revision").on(t.taskId, t.revision),
    foreignKey({
      columns: [t.taskId, t.branchId],
      foreignColumns: [dailyOperationTasks.id, dailyOperationTasks.branchId],
    }),
  ],
);
export const dailyOperationDependencies = pgTable(
  "daily_operation_task_dependencies",
  {
    branchId: uuid("branch_id")
      .notNull()
      .references(() => branches.id),
    taskId: uuid("task_id").notNull(),
    dependsOnId: uuid("depends_on_id").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.dependsOnId] }),
    check(
      "daily_operation_no_self_dependency",
      sql`${t.taskId}<>${t.dependsOnId}`,
    ),
    foreignKey({
      columns: [t.taskId, t.branchId],
      foreignColumns: [dailyOperationTasks.id, dailyOperationTasks.branchId],
    }),
    foreignKey({
      columns: [t.dependsOnId, t.branchId],
      foreignColumns: [dailyOperationTasks.id, dailyOperationTasks.branchId],
    }),
  ],
);
export const dailyOperationSettings = pgTable(
  "daily_operation_branch_settings",
  {
    branchId: uuid("branch_id")
      .primaryKey()
      .references(() => branches.id),
    revision: integer("revision").notNull().default(1),
    updatedAt: at("updated_at").notNull().defaultNow(),
  },
);
