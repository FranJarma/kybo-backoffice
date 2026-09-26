import { asc, eq, inArray } from "drizzle-orm";
import {
  preparationStations,
  preparationTasks,
  preparationTaskLines,
  preparationEvents,
} from "@/db/preparation-schema";
import { saleOrders, sales, saleLines } from "@/db/sales-schema";
import { user } from "@/db/auth-schema";
import { notFound, type Tx } from "@/modules/inventory/service";
import type { PrepTask, PrepDetail, PrepStatus, Station } from "./types";
import type { SaleOrigin, SaleChannel } from "@/modules/sales/types";
import { orderTiming } from "./timing";
export const iso = (d: Date | null) => d?.toISOString() ?? null;
export const stationView = (
  s: typeof preparationStations.$inferSelect,
): Station => ({
  id: s.id,
  name: s.name,
  revision: s.revision,
  archived: !!s.archivedAt,
});
export async function taskViews(tx: Tx, ids: string[]): Promise<PrepTask[]> {
  if (!ids.length) return [];
  const rows = await tx
    .select({
      task: preparationTasks,
      order: saleOrders,
      sale: {
        id: sales.id,
        number: sales.number,
        origin: sales.origin,
        channel: sales.channel,
        tableName: sales.tableName,
        externalId: sales.externalId,
        customerName: sales.customerName,
        fulfillment: sales.fulfillment,
        status: sales.status,
      },
      assigneeName: user.name,
    })
    .from(preparationTasks)
    .innerJoin(saleOrders, eq(saleOrders.id, preparationTasks.orderId))
    .innerJoin(sales, eq(sales.id, saleOrders.saleId))
    .leftJoin(user, eq(user.id, preparationTasks.assigneeId))
    .where(inArray(preparationTasks.id, ids));
  const lines = await tx
    .select({
      taskId: preparationTaskLines.taskId,
      line: {
        id: saleLines.id,
        name: saleLines.name,
        quantity: saleLines.quantity,
        notes: saleLines.notes,
      },
    })
    .from(preparationTaskLines)
    .innerJoin(saleLines, eq(saleLines.id, preparationTaskLines.lineId))
    .where(inArray(preparationTaskLines.taskId, ids))
    .orderBy(asc(saleLines.position));
  const siblings = await tx
    .select()
    .from(preparationTasks)
    .where(
      inArray(preparationTasks.orderId, [
        ...new Set(rows.map((r) => r.task.orderId)),
      ]),
    )
    .orderBy(asc(preparationTasks.stationName), asc(preparationTasks.id));
  const clock = (t: typeof preparationTasks.$inferSelect) => ({
    status: t.status,
    enqueuedAt: t.enqueuedAt.toISOString(),
    startedAt: iso(t.startedAt),
    readyAt: iso(t.readyAt),
    deliveredAt: iso(t.deliveredAt),
  });
  const views = rows.map(
    ({ task: t, order: o, sale: s, assigneeName }): PrepTask => ({
      id: t.id,
      revision: t.revision,
      orderId: o.id,
      saleId: s.id,
      saleNumber: s.number,
      sequence: o.sequence,
      origin: s.origin as SaleOrigin,
      channel: s.channel as SaleChannel,
      tableName: s.tableName,
      externalId: s.externalId,
      customerName: s.customerName,
      fulfillment: s.fulfillment,
      notes: o.notes,
      saleCancelled: s.status === "cancelled",
      stationId: t.stationId,
      stationName: t.stationName,
      status: t.status as PrepStatus,
      assigneeId: t.assigneeId,
      assigneeName,
      enqueuedAt: t.enqueuedAt.toISOString(),
      startedAt: iso(t.startedAt),
      readyAt: iso(t.readyAt),
      deliveredAt: iso(t.deliveredAt),
      cancelledAt: iso(t.cancelledAt),
      lines: lines.filter((l) => l.taskId === t.id).map((l) => l.line),
      siblings: siblings
        .filter((s) => s.orderId === o.id)
        .map((s) => ({
          id: s.id,
          stationName: s.stationName,
          status: s.status as PrepStatus,
        })),
      timing: orderTiming([clock(t)]),
      orderTiming: orderTiming(
        siblings.filter((s) => s.orderId === o.id).map(clock),
      ),
    }),
  );
  return ids.map((id) => views.find((v) => v.id === id)!).filter(Boolean);
}
export async function taskDetail(tx: Tx, id: string): Promise<PrepDetail> {
  const [task] = await taskViews(tx, [id]);
  if (!task) notFound();
  const rows = await tx
    .select({ event: preparationEvents, name: user.name })
    .from(preparationEvents)
    .innerJoin(user, eq(user.id, preparationEvents.actorId))
    .where(eq(preparationEvents.taskId, id))
    .orderBy(asc(preparationEvents.revision));
  return {
    task,
    events: rows.map(({ event: e, name }) => ({
      id: e.id,
      revision: e.revision,
      action: e.action,
      actorId: e.actorId,
      actorName: name,
      assigneeId: e.assigneeId,
      reason: e.reason,
      createdAt: e.createdAt.toISOString(),
    })),
  };
}
