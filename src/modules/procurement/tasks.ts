import { and, eq, sql } from "drizzle-orm";
import type { Tx } from "@/db/types";
import type { OperationalContext } from "../operations/types";
import {
  dailyOperationTasks as tasks,
  dailyOperationEvents as events,
} from "@/db/daily-operation-schema";
import { purchaseOrders } from "@/db/procurement-schema";
import { businessDate } from "../operations/business-date";
import { addDays, dayStart } from "../supply-alerts/engine";
import type { TaskState, Urgency } from "../daily-operations/types";
export async function syncPurchaseTask(
  tx: Tx,
  ctx: OperationalContext,
  o: typeof purchaseOrders.$inferSelect,
  now = new Date(),
) {
  if (o.state === "draft") return;
  const available = await tx.execute(
    sql`select to_regclass('public.daily_operation_tasks') as name`,
  );
  if (!available.rows[0]?.name) return;
  const today = businessDate(now, ctx.timeZone);
  const state =
    o.state === "received"
      ? "done"
      : o.state === "cancelled"
        ? "cancelled"
        : "pending";
  const urgency =
    !o.expectedOn || o.expectedOn < today
      ? "critical"
      : o.expectedOn === today
        ? "high"
        : "scheduled";
  const dueAt = o.expectedOn
    ? new Date(dayStart(addDays(o.expectedOn, 1), ctx.timeZone).getTime() - 1)
    : null;
  const reason = `${o.expectedOn ? `Llegada estimada: ${o.expectedOn.split("-").reverse().join("/")}. ${o.expectedOn < today ? "Pedido atrasado: confirmá una nueva fecha con el proveedor. " : ""}` : "Sin fecha confirmada: consultá al proveedor. "}${o.state === "partially_received" ? "Recepción parcial; queda mercadería pendiente. " : ""}Abrí el pedido en Compras para registrar lo recibido. El stock solo aumenta al recibir.`;
  const [old] = await tx
    .select()
    .from(tasks)
    .where(
      and(
        eq(tasks.branchId, ctx.branchId),
        eq(tasks.kind, "purchase"),
        eq(tasks.documentId, o.id),
        eq(tasks.documentRole, "receive"),
      ),
    )
    .for("update");
  if (old?.documentRevision && old.documentRevision > o.revision) return;
  if (old && old.documentRevision === o.revision && old.urgency === urgency)
    return;
  const data = {
    title: `Recibir pedido de ${o.supplierName}`,
    reason,
    dueAt,
    urgency: urgency as Urgency,
    state: state as TaskState,
    documentRevision: o.revision,
  };
  if (old && old.documentRevision === o.revision && old.state === "blocked") {
    data.state = old.state;
    data.reason = old.reason;
  }
  const [saved] = old
    ? await tx
        .update(tasks)
        .set({ ...data, revision: old.revision + 1, updatedAt: now })
        .where(eq(tasks.id, old.id))
        .returning()
    : await tx
        .insert(tasks)
        .values({
          ...data,
          branchId: ctx.branchId,
          kind: "purchase",
          documentId: o.id,
          documentRole: "receive",
        })
        .returning();
  await tx.insert(events).values({
    branchId: ctx.branchId,
    taskId: saved.id,
    revision: saved.revision,
    action: "purchase_sync",
    actorId: ctx.actorId,
  });
}
