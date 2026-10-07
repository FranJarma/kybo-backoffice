import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray, isNotNull } from "drizzle-orm";
import type { Actor } from "@/lib/access";
import { conflict, type Tx } from "@/modules/inventory/service";
import { saleLines, saleOrders } from "@/db/sales-schema";
import {
  preparationRoutes,
  preparationStations,
  preparationTasks,
  preparationTaskLines,
  preparationEvents,
} from "@/db/preparation-schema";
import { activeStates } from "./types";

// Called only with the order's product SHARE locks held by the sales transaction.
export async function publishOrder(tx: Tx, actor: Actor, orderId: string) {
  if (!actor.branchId)
    conflict("Seleccioná una sucursal antes de publicar el pedido.");
  const lines = await tx
    .select({ id: saleLines.id, stationId: preparationRoutes.stationId })
    .from(saleLines)
    .leftJoin(
      preparationRoutes,
      and(
        eq(preparationRoutes.productId, saleLines.productId),
        eq(preparationRoutes.branchId, actor.branchId!),
      ),
    )
    .where(
      and(eq(saleLines.orderId, orderId), isNotNull(saleLines.recipeVersionId)),
    );
  const ids = [
    ...new Set(lines.flatMap((l) => (l.stationId ? [l.stationId] : []))),
  ].sort();
  const names = new Map<string, string>();
  for (const id of ids) {
    const [s] = await tx
      .select()
      .from(preparationStations)
      .where(eq(preparationStations.id, id))
      .for("share");
    if (!s || s.archivedAt || s.branchId !== actor.branchId)
      conflict(
        "La estación cambió. Revisá su configuración antes de confirmar.",
      );
    names.set(id, s.name);
  }
  const groups = new Map<string | null, string[]>();
  for (const l of lines)
    groups.set(l.stationId, [...(groups.get(l.stationId) ?? []), l.id]);
  const now = new Date();
  for (const [stationId, lineIds] of groups) {
    const id = randomUUID();
    await tx.insert(preparationTasks).values({
      id,
      orderId,
      branchId: actor.branchId!,
      stationId,
      stationName: stationId ? names.get(stationId)! : "General",
      enqueuedAt: now,
    });
    await tx
      .insert(preparationTaskLines)
      .values(lineIds.map((lineId) => ({ taskId: id, lineId })));
    await tx.insert(preparationEvents).values({
      taskId: id,
      revision: 1,
      action: "queued",
      actorId: actor.id,
      createdAt: now,
    });
  }
}
// The caller already holds the sale row lock, matching every task action.
export async function cancelSaleTasks(
  tx: Tx,
  actor: Actor,
  saleId: string,
  reason: string,
) {
  const orders = await tx
    .select({ id: saleOrders.id })
    .from(saleOrders)
    .where(eq(saleOrders.saleId, saleId));
  if (!orders.length) return;
  const tasks = await tx
    .select()
    .from(preparationTasks)
    .where(
      and(
        inArray(
          preparationTasks.orderId,
          orders.map((o) => o.id),
        ),
        inArray(preparationTasks.status, activeStates),
      ),
    )
    .orderBy(asc(preparationTasks.id))
    .for("update");
  const now = new Date();
  for (const t of tasks) {
    await tx
      .update(preparationTasks)
      .set({ status: "cancelled", cancelledAt: now, revision: t.revision + 1 })
      .where(eq(preparationTasks.id, t.id));
    await tx.insert(preparationEvents).values({
      taskId: t.id,
      revision: t.revision + 1,
      action: "cancel",
      actorId: actor.id,
      assigneeId: t.assigneeId,
      reason,
      createdAt: now,
    });
  }
}
