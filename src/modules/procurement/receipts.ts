import { and, eq } from "drizzle-orm";
import type { Tx } from "@/db/types";
import type { OperationalContext } from "../operations/types";
import { AppError } from "@/lib/errors";
import {
  purchaseOrders as orders,
  purchaseOrderLines as lines,
  purchaseOrderReceipts as allocations,
} from "@/db/procurement-schema";
import { integer, safeQuantity } from "../inventory/decimal";
import { parseReceive } from "../inventory/validation";
import { procurementAvailable } from "./queries";
import { syncPurchaseTask } from "./tasks";
type Input = ReturnType<typeof parseReceive>;
export async function lockPurchaseReceipt(
  tx: Tx,
  ctx: OperationalContext,
  input: Input,
) {
  if (!input.purchaseOrderId) {
    if (input.expectedOrderRevision || input.lines.some((l) => l.orderLineId))
      throw new AppError(
        "VALIDATION",
        "Las líneas de pedido requieren identificar el pedido.",
        400,
      );
    return null;
  }
  if (!(await procurementAvailable(tx)))
    throw new AppError(
      "MIGRATION_REQUIRED",
      "Falta habilitar los pedidos a proveedores.",
      409,
    );
  const [order] = await tx
    .select()
    .from(orders)
    .where(
      and(
        eq(orders.id, input.purchaseOrderId),
        eq(orders.branchId, ctx.branchId),
      ),
    )
    .for("update");
  if (!order)
    throw new AppError(
      "NOT_FOUND",
      "El pedido no pertenece a esta sucursal.",
      404,
    );
  if (
    !["ordered", "partially_received"].includes(order.state) ||
    order.revision !== input.expectedOrderRevision
  )
    throw new AppError(
      "CONFLICT",
      "El pedido cambió o ya está cerrado. Actualizalo antes de recibir.",
      409,
    );
  if (order.supplierId !== input.supplierId)
    throw new AppError(
      "CONFLICT",
      "El proveedor no corresponde al pedido.",
      409,
    );
  if (input.receivedOn < order.orderedOn)
    throw new AppError(
      "VALIDATION",
      "La recepción no puede ser anterior al pedido.",
      400,
    );
  const rows = await tx.select().from(lines).where(eq(lines.orderId, order.id));
  const byId = new Map(rows.map((l) => [l.id, l]));
  for (const l of input.lines) {
    const ref = l.orderLineId ? byId.get(l.orderLineId) : undefined;
    if (
      !ref ||
      ref.itemId !== l.itemId ||
      ref.presentationId !== l.presentationId
    )
      throw new AppError(
        "CONFLICT",
        "Un insumo o presentación no corresponde a este pedido.",
        409,
      );
  }
  return { order, byId };
}
export async function finishPurchaseReceipt(
  tx: Tx,
  ctx: OperationalContext,
  reference: Awaited<ReturnType<typeof lockPurchaseReceipt>>,
  received: { orderLineId: string; receiptLineId: string; quantity: string }[],
) {
  if (!reference) return;
  const totals = new Map<string, bigint>();
  for (const r of received)
    totals.set(
      r.orderLineId,
      (totals.get(r.orderLineId) ?? 0n) + integer(r.quantity),
    );
  for (const [id, quantity] of totals) {
    const line = reference.byId.get(id)!;
    const next = integer(line.receivedQuantity) + quantity;
    if (next + integer(line.cancelledQuantity) > integer(line.orderedQuantity))
      throw new AppError(
        "CONFLICT",
        `La recepción supera lo pendiente de ${line.itemName}. Revisá las cantidades.`,
        409,
      );
    await tx
      .update(lines)
      .set({ receivedQuantity: safeQuantity(next) })
      .where(eq(lines.id, id));
    line.receivedQuantity = safeQuantity(next);
  }
  for (const r of received)
    await tx.insert(allocations).values({ ...r, orderId: reference.order.id });
  const remaining = [...reference.byId.values()].some(
    (l) =>
      integer(l.orderedQuantity) >
      integer(l.receivedQuantity) + integer(l.cancelledQuantity),
  );
  const [saved] = await tx
    .update(orders)
    .set({
      state: remaining ? "partially_received" : "received",
      revision: reference.order.revision + 1,
      updatedAt: new Date(),
    })
    .where(eq(orders.id, reference.order.id))
    .returning();
  await syncPurchaseTask(tx, ctx, saved);
}
