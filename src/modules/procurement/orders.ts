import { and, eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import {
  purchaseOrders as orders,
  purchaseOrderLines as lines,
} from "@/db/procurement-schema";
import {
  items,
  suppliers,
  purchasePresentations,
  auditEvents,
} from "@/db/business-schema";
import { executeCommand } from "../operations/command";
import { businessDate } from "../operations/business-date";
import {
  exactDivision,
  integer,
  safeQuantity,
  SCALE,
} from "../inventory/decimal";
import { createOrderSchema, orderCommandSchema } from "./validation";
import { procurementAvailable, readOrder } from "./queries";
import { syncPurchaseTask } from "./tasks";
export async function createPurchaseDraft(
  db: AppDb,
  actor: Actor,
  raw: unknown,
) {
  const input = createOrderSchema.parse(raw);
  return executeCommand(
    db,
    actor,
    actor.branchId ?? "",
    input,
    "purchase-order-create",
    input,
    async (tx, ctx) => {
      if (!(await procurementAvailable(tx)))
        throw new AppError(
          "MIGRATION_REQUIRED",
          "Falta habilitar los pedidos a proveedores.",
          409,
        );
      if (input.orderedOn > businessDate(new Date(), ctx.timeZone))
        throw new AppError(
          "VALIDATION",
          "La fecha del pedido no puede ser futura.",
          400,
        );
      // Match receipt/catalog lock order: presentations, supplier, then items.
      const presentations = new Map<
        string,
        typeof purchasePresentations.$inferSelect
      >();
      for (const id of [
        ...new Set(
          input.lines.flatMap((l) =>
            l.presentationId ? [l.presentationId] : [],
          ),
        ),
      ].sort()) {
        const [p] = await tx
          .select()
          .from(purchasePresentations)
          .where(eq(purchasePresentations.id, id))
          .for("share");
        if (!p || p.archivedAt || p.supplierId !== input.supplierId)
          throw new AppError(
            "CONFLICT",
            "La presentación no está disponible para este proveedor.",
            409,
          );
        presentations.set(id, p);
      }
      const [supplier] = await tx
        .select()
        .from(suppliers)
        .where(eq(suppliers.id, input.supplierId))
        .for("share");
      if (!supplier || supplier.archivedAt)
        throw new AppError("CONFLICT", "Elegí un proveedor activo.", 409);
      const itemRows = new Map<string, typeof items.$inferSelect>();
      for (const id of [...new Set(input.lines.map((l) => l.itemId))].sort()) {
        const [i] = await tx
          .select()
          .from(items)
          .where(eq(items.id, id))
          .for("share");
        if (
          !i ||
          i.archivedAt ||
          !i.purchasable ||
          !i.stockTracked ||
          i.class === "unclassified"
        )
          throw new AppError(
            "CONFLICT",
            "Elegí insumos activos y habilitados para compras e inventario.",
            409,
          );
        itemRows.set(id, i);
      }
      const [order] = await tx
        .insert(orders)
        .values({
          branchId: ctx.branchId,
          supplierId: supplier.id,
          supplierName: supplier.name,
          orderedOn: input.orderedOn,
          expectedOn: input.expectedOn,
          notes: input.notes,
          actorId: ctx.actorId,
        })
        .returning();
      for (const [position, line] of input.lines.entries()) {
        const i = itemRows.get(line.itemId)!,
          p = line.presentationId
            ? presentations.get(line.presentationId)
            : null;
        if (p && p.itemId !== i.id)
          throw new AppError(
            "VALIDATION",
            "La presentación no corresponde al insumo.",
            400,
          );
        if (
          (p || i.baseUnit === "unit") &&
          integer(line.quantity) % SCALE !== 0n
        )
          throw new AppError(
            "VALIDATION",
            "Ingresá una cantidad entera de unidades o presentaciones.",
            400,
          );
        const factor = p ? integer(p.baseQuantity) : SCALE;
        await tx.insert(lines).values({
          orderId: order.id,
          position,
          itemId: i.id,
          itemName: i.name,
          baseUnit: i.baseUnit,
          presentationId: p?.id ?? null,
          presentationName: p?.name ?? null,
          conversionFactor: safeQuantity(factor),
          quantity: line.quantity,
          orderedQuantity: safeQuantity(
            exactDivision(integer(line.quantity) * factor, SCALE),
          ),
        });
      }
      await tx.insert(auditEvents).values({
        actorId: ctx.actorId,
        entity: "purchase-orders",
        recordId: order.id,
        action: "draft",
        after: input,
      });
      return readOrder(tx, ctx.branchId, order.id);
    },
  );
}
export async function commandPurchaseOrder(
  db: AppDb,
  actor: Actor,
  id: string,
  raw: unknown,
) {
  const input = orderCommandSchema.parse(raw);
  return executeCommand(
    db,
    actor,
    actor.branchId ?? "",
    input,
    "purchase-order-command",
    { id, ...input },
    async (tx, ctx) => {
      if (!(await procurementAvailable(tx)))
        throw new AppError(
          "MIGRATION_REQUIRED",
          "Falta habilitar los pedidos a proveedores.",
          409,
        );
      const [o] = await tx
        .select()
        .from(orders)
        .where(and(eq(orders.id, id), eq(orders.branchId, ctx.branchId)))
        .for("update");
      if (!o) throw new AppError("NOT_FOUND", "No se encontró el pedido.", 404);
      if (o.revision !== input.expectedRevision)
        throw new AppError(
          "CONFLICT",
          "El pedido cambió. Actualizalo antes de continuar.",
          409,
        );
      if (["received", "cancelled"].includes(o.state))
        throw new AppError("CONFLICT", "El pedido ya está cerrado.", 409);
      let data: Partial<typeof orders.$inferInsert> = {
        revision: o.revision + 1,
        updatedAt: new Date(),
      };
      if (input.action === "confirm") {
        if (o.state !== "draft")
          throw new AppError("CONFLICT", "El pedido ya fue confirmado.", 409);
        const [vendor] = await tx
          .select()
          .from(suppliers)
          .where(eq(suppliers.id, o.supplierId))
          .for("share");
        if (!vendor || vendor.archivedAt)
          throw new AppError("CONFLICT", "El proveedor está archivado.", 409);
        const requested = await tx
          .select()
          .from(lines)
          .where(eq(lines.orderId, id));
        for (const itemId of [
          ...new Set(requested.map((l) => l.itemId)),
        ].sort()) {
          const [item] = await tx
            .select()
            .from(items)
            .where(eq(items.id, itemId))
            .for("share");
          if (
            !item ||
            item.archivedAt ||
            !item.purchasable ||
            !item.stockTracked ||
            requested.some(
              (l) => l.itemId === itemId && l.baseUnit !== item.baseUnit,
            )
          )
            throw new AppError(
              "CONFLICT",
              "Un insumo cambió de unidad o ya no está disponible. Revisá el pedido antes de confirmarlo.",
              409,
            );
        }
        data = { ...data, state: "ordered" };
      } else if (input.action === "reschedule") {
        if (input.expectedOn && input.expectedOn < o.orderedOn)
          throw new AppError(
            "VALIDATION",
            "La llegada no puede ser anterior al pedido.",
            400,
          );
        data = { ...data, expectedOn: input.expectedOn };
      } else {
        const rows = await tx.select().from(lines).where(eq(lines.orderId, id));
        for (const l of rows)
          await tx
            .update(lines)
            .set({
              cancelledQuantity: safeQuantity(
                integer(l.orderedQuantity) - integer(l.receivedQuantity),
              ),
            })
            .where(eq(lines.id, l.id));
        data = { ...data, state: "cancelled" };
      }
      const [saved] = await tx
        .update(orders)
        .set(data)
        .where(eq(orders.id, id))
        .returning();
      await syncPurchaseTask(tx, ctx, saved);
      await tx.insert(auditEvents).values({
        actorId: ctx.actorId,
        entity: "purchase-orders",
        recordId: id,
        action: input.action,
        after: input,
      });
      return readOrder(tx, ctx.branchId, id);
    },
  );
}
