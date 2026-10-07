import { and, eq, inArray } from "drizzle-orm";
import type { Tx } from "@/db/types";
import {
  saleLineFulfillments,
  fulfillmentEvents,
} from "@/db/fulfillment-event-schema";
import { reservationAllocations } from "@/db/reservation-schema";
import {
  preparationTasks,
  preparationTaskLines,
  preparationEvents,
} from "@/db/preparation-schema";
import { saleOrders, saleLines, sales } from "@/db/sales-schema";
import type { OperationalContext, StockAllocation } from "../operations/types";
import {
  transitionLine,
  completionPortion,
  type LineProgress,
} from "./quantities";
import { settleReservation } from "../inventory/reservations";
import { lockStock } from "../inventory/locking";
import { postMovement } from "../inventory/ledger";
import { integer, six } from "../inventory/decimal";
import { AppError } from "@/lib/errors";
export type LineQuantity = { saleLineId: string; quantity: number };
function fail(message: string): never {
  throw new AppError("FULFILLMENT_CONFLICT", message, 409);
}
async function lockOrder(tx: Tx, ctx: OperationalContext, orderId: string) {
  const [order] = await tx
    .select()
    .from(saleOrders)
    .where(
      and(eq(saleOrders.id, orderId), eq(saleOrders.branchId, ctx.branchId)),
    );
  if (!order) fail("El pedido no pertenece a esta sucursal.");
  const [sale] = await tx
    .select()
    .from(sales)
    .where(and(eq(sales.id, order.saleId), eq(sales.branchId, ctx.branchId)))
    .for("update");
  if (!sale || sale.status === "cancelled")
    fail("La venta está anulada o no está disponible.");
  return order;
}
async function applyLines(
  tx: Tx,
  ctx: OperationalContext,
  orderId: string,
  operationId: string,
  action: "complete" | "deliver",
  lines: LineQuantity[],
) {
  if (
    !lines.length ||
    new Set(lines.map((l) => l.saleLineId)).size !== lines.length
  )
    fail("Indicá líneas distintas y cantidades pendientes.");
  const ids = lines.map((l) => l.saleLineId).sort();
  const snapshots = await tx
    .select({ fulfillment: saleLineFulfillments })
    .from(saleLineFulfillments)
    .innerJoin(saleLines, eq(saleLines.id, saleLineFulfillments.saleLineId))
    .where(
      and(
        inArray(saleLineFulfillments.saleLineId, ids),
        eq(saleLineFulfillments.branchId, ctx.branchId),
        eq(saleLines.orderId, orderId),
      ),
    )
    .orderBy(saleLineFulfillments.saleLineId)
    .for("update");
  if (snapshots.length !== lines.length)
    fail(
      "Alguna línea no pertenece al pedido o conserva inventario histórico sin gestionar.",
    );
  const allocations = await tx
    .select()
    .from(reservationAllocations)
    .where(
      inArray(
        reservationAllocations.reservationId,
        snapshots.map((s) => s.fulfillment.reservationId),
      ),
    )
    .orderBy(
      reservationAllocations.itemId,
      reservationAllocations.locationId,
      reservationAllocations.lotId,
    );
  await lockStock(tx, ctx, allocations, true);
  for (const { fulfillment: row } of snapshots) {
    const amount = lines.find((l) => l.saleLineId === row.saleLineId)!.quantity;
    const transition = transitionLine(row as LineProgress, action, amount);
    if (transition.consume) {
      // Allocate each component proportionally; the last completion owns rounding residues.
      const remainingUnits =
        row.ordered -
        (row.mode === "recipe" ? row.completed : row.delivered) -
        row.cancelled;
      const consume: StockAllocation[] = [];
      const groups = new Map<string, typeof allocations>();
      for (const a of allocations.filter(
        (a) => a.reservationId === row.reservationId,
      )) {
        const key = `${a.itemId}/${a.locationId}`;
        groups.set(key, [...(groups.get(key) ?? []), a]);
      }
      for (const group of groups.values()) {
        const available = group.reduce(
          (sum, a) =>
            sum +
            integer(a.allocated) -
            integer(a.consumed) -
            integer(a.released),
          0n,
        );
        let needed = completionPortion(available, amount, remainingUnits);
        for (const a of group) {
          const remaining =
            integer(a.allocated) - integer(a.consumed) - integer(a.released);
          const q = remaining < needed ? remaining : needed;
          if (q > 0n)
            consume.push({
              itemId: a.itemId,
              lotId: a.lotId,
              locationId: a.locationId,
              quantity: six(q),
            });
          needed -= q;
        }
        if (needed !== 0n) fail("La reserva no alcanza para esta cantidad.");
      }
      if (!consume.length)
        fail("La línea no tiene una reserva física disponible.");
      if (consume.length) {
        await settleReservation(tx, ctx, {
          reservationId: row.reservationId,
          consume,
          release: [],
          operationId,
        });
        await postMovement(tx, ctx, {
          operationId,
          documentId: row.documentId,
          action: action === "complete" ? "sale_consume" : "direct_dispatch",
          legs: consume.map((a) => ({
            ...a,
            direction: "out",
            incomingValue: null,
          })),
          reason: null,
        });
      }
    }
    await tx
      .update(saleLineFulfillments)
      .set({
        completed: transition.next.completed,
        delivered: transition.next.delivered,
        revision: row.revision + 1,
      })
      .where(eq(saleLineFulfillments.saleLineId, row.saleLineId));
    await tx
      .insert(fulfillmentEvents)
      .values({
        operationId,
        branchId: ctx.branchId,
        saleLineId: row.saleLineId,
        action,
        quantity: amount,
        revision: row.revision + 1,
      });
  }
}
export async function completePreparation(
  tx: Tx,
  ctx: OperationalContext,
  input: {
    operationId: string;
    taskId: string;
    lines: LineQuantity[];
    expectedRevision: number;
  },
) {
  const [identity] = await tx
    .select()
    .from(preparationTasks)
    .where(
      and(
        eq(preparationTasks.id, input.taskId),
        eq(preparationTasks.branchId, ctx.branchId),
      ),
    );
  if (!identity) fail("La tarea no pertenece a esta sucursal.");
  await lockOrder(tx, ctx, identity.orderId);
  const [task] = await tx
    .select()
    .from(preparationTasks)
    .where(eq(preparationTasks.id, input.taskId))
    .for("update");
  if (
    task.revision !== input.expectedRevision ||
    task.status !== "preparing" ||
    task.assigneeId !== ctx.actorId
  )
    fail("La tarea cambió o debe finalizarla su responsable.");
  const members = await tx
    .select()
    .from(preparationTaskLines)
    .where(eq(preparationTaskLines.taskId, input.taskId));
  if (input.lines.some((l) => !members.some((m) => m.lineId === l.saleLineId)))
    fail("La línea no pertenece a esta tarea.");
  await applyLines(
    tx,
    ctx,
    task.orderId,
    input.operationId,
    "complete",
    input.lines,
  );
  const progress = await tx
    .select()
    .from(saleLineFulfillments)
    .where(
      inArray(
        saleLineFulfillments.saleLineId,
        members.map((m) => m.lineId),
      ),
    );
  const ready =
    progress.length === members.length &&
    progress.every((l) => l.completed + l.cancelled === l.ordered);
  await tx
    .update(preparationTasks)
    .set({
      revision: task.revision + 1,
      status: ready ? "ready" : "preparing",
      readyAt: ready ? new Date() : null,
    })
    .where(eq(preparationTasks.id, task.id));
  return { revision: task.revision + 1 };
}
export async function deliverLines(
  tx: Tx,
  ctx: OperationalContext,
  input: {
    operationId: string;
    orderId: string;
    lines: LineQuantity[];
    updateTasks?: boolean;
  },
) {
  await lockOrder(tx, ctx, input.orderId);
  await applyLines(
    tx,
    ctx,
    input.orderId,
    input.operationId,
    "deliver",
    input.lines,
  );
  if (input.updateTasks === false) return;
  const tasks = await tx
    .select()
    .from(preparationTasks)
    .where(
      and(
        eq(preparationTasks.orderId, input.orderId),
        eq(preparationTasks.branchId, ctx.branchId),
      ),
    )
    .orderBy(preparationTasks.id)
    .for("update");
  for (const task of tasks) {
    if (task.status !== "ready") continue;
    const rows = await tx
      .select({ progress: saleLineFulfillments })
      .from(preparationTaskLines)
      .innerJoin(
        saleLineFulfillments,
        eq(saleLineFulfillments.saleLineId, preparationTaskLines.lineId),
      )
      .where(eq(preparationTaskLines.taskId, task.id));
    if (
      rows.length &&
      rows.every(
        (r) =>
          r.progress.delivered + r.progress.cancelled === r.progress.ordered,
      )
    ) {
      const now = new Date();
      await tx
        .update(preparationTasks)
        .set({
          status: "delivered",
          revision: task.revision + 1,
          deliveredAt: now,
        })
        .where(eq(preparationTasks.id, task.id));
      await tx
        .insert(preparationEvents)
        .values({
          taskId: task.id,
          revision: task.revision + 1,
          action: "deliver",
          actorId: ctx.actorId,
          assigneeId: task.assigneeId,
          createdAt: now,
        });
    }
  }
}
