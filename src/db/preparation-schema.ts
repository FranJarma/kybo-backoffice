import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
  uniqueIndex,
  primaryKey,
  check,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";
import { products } from "./business-schema";
import { saleOrders, saleLines } from "./sales-schema";
const at = (name: string) => timestamp(name, { withTimezone: true });
export const preparationStations = pgTable(
  "preparation_stations",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    revision: integer("revision").notNull().default(1),
    archivedAt: at("archived_at"),
    createdAt: at("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("preparation_station_name")
      .on(sql`lower(${t.name})`)
      .where(sql`${t.archivedAt} is null`),
  ],
);
export const preparationRoutes = pgTable(
  "preparation_routes",
  {
    productId: uuid("product_id")
      .primaryKey()
      .references(() => products.id, { onDelete: "restrict" }),
    stationId: uuid("station_id").references(() => preparationStations.id, {
      onDelete: "restrict",
    }),
    revision: integer("revision").notNull().default(1),
  },
  (t) => [index("preparation_route_station").on(t.stationId)],
);
export const preparationTasks = pgTable(
  "preparation_tasks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => saleOrders.id, { onDelete: "restrict" }),
    stationId: uuid("station_id").references(() => preparationStations.id, {
      onDelete: "restrict",
    }),
    stationName: text("station_name").notNull(),
    status: text("status").notNull().default("pending"),
    revision: integer("revision").notNull().default(1),
    assigneeId: text("assignee_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    enqueuedAt: at("enqueued_at").notNull().defaultNow(),
    startedAt: at("started_at"),
    readyAt: at("ready_at"),
    deliveredAt: at("delivered_at"),
    cancelledAt: at("cancelled_at"),
  },
  (t) => [
    index("preparation_active_queue").on(t.status, t.enqueuedAt, t.id),
    index("preparation_order").on(t.orderId),
    index("preparation_assignee").on(t.assigneeId, t.status),
    uniqueIndex("preparation_order_station")
      .on(t.orderId, t.stationId)
      .where(sql`${t.stationId} is not null`),
    uniqueIndex("preparation_order_general")
      .on(t.orderId)
      .where(sql`${t.stationId} is null`),
    check(
      "preparation_task_state",
      sql`${t.status} in ('pending','preparing','ready','delivered','cancelled')`,
    ),
    check(
      "preparation_task_progress",
      sql`(${t.status} not in ('preparing','ready','delivered') or (${t.startedAt} is not null and ${t.assigneeId} is not null)) and (${t.status} not in ('ready','delivered') or ${t.readyAt} is not null) and (${t.status} <> 'delivered' or ${t.deliveredAt} is not null) and (${t.status} <> 'cancelled' or ${t.cancelledAt} is not null)`,
    ),
  ],
);
export const preparationTaskLines = pgTable(
  "preparation_task_lines",
  {
    taskId: uuid("task_id")
      .notNull()
      .references(() => preparationTasks.id, { onDelete: "restrict" }),
    lineId: uuid("line_id")
      .notNull()
      .references(() => saleLines.id, { onDelete: "restrict" }),
  },
  (t) => [
    primaryKey({ columns: [t.taskId, t.lineId] }),
    uniqueIndex("preparation_line_once").on(t.lineId),
  ],
);
export const preparationEvents = pgTable(
  "preparation_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => preparationTasks.id, { onDelete: "restrict" }),
    revision: integer("revision").notNull(),
    action: text("action").notNull(),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
    assigneeId: text("assignee_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    reason: text("reason"),
    createdAt: at("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("preparation_event_revision").on(t.taskId, t.revision),
    check(
      "preparation_event_action",
      sql`${t.action} in ('queued','start','ready','deliver','reassign','cancel')`,
    ),
  ],
);
