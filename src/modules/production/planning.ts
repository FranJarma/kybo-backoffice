import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/db/types";
import { productionOrders } from "@/db/production-order-schema";
import { stockDocuments } from "@/db/inventory-document-schema";
import { items } from "@/db/item-schema";
import { recipeOptions, recipeVersions } from "@/db/recipe-schema";
import { auditEvents } from "@/db/business-schema";
import { AppError } from "@/lib/errors";
import type { OperationalContext } from "../operations/types";
import { lockStock } from "../inventory/locking";
import { reserveStock } from "../inventory/reservations";
import { integer } from "../inventory/decimal";
import { consumptionQuantity } from "../recipes/waste";
import { confirmProduction } from "./orders";
import {
  lockedProduction,
  productionExecutor,
  productionManager,
  requireAssignee,
} from "./access";

const assignmentSchema = z
  .object({
    assignedTo: z.string().min(1).max(200),
    scheduledFor: z.iso
      .datetime({ offset: true })
      .transform((v) => new Date(v)),
    notes: z.string().trim().max(2000).default(""),
  })
  .strict();
type Composition = {
  components: { itemId: string; quantity: string }[];
  selections: { lineId: string; optionId: string | null }[];
  untracked: { itemId: string; unitCost: string | null }[];
};
function fail(message: string): never {
  throw new AppError("PRODUCTION_CONFLICT", message, 409);
}

export async function planProduction(
  tx: Tx,
  ctx: OperationalContext,
  operationId: string,
  order: unknown,
  raw: unknown,
) {
  productionManager(ctx);
  const assignment = assignmentSchema.parse(raw);
  await requireAssignee(tx, ctx.branchId, assignment.assignedTo);
  return confirmProduction(tx, ctx, operationId, order, assignment);
}

export async function startProduction(
  tx: Tx,
  ctx: OperationalContext,
  operationId: string,
  id: string,
  raw: unknown,
) {
  const input = z
    .object({ expectedRevision: z.number().int().positive() })
    .strict()
    .parse(raw);
  const order = await lockedProduction(tx, ctx, id, input.expectedRevision);
  productionExecutor(ctx, order.assignedTo);
  if (order.state !== "planned") fail("Esta orden ya comenzó o terminó.");
  const composition = order.composition as Composition;
  await lockStock(
    tx,
    ctx,
    [...composition.components, { itemId: order.outputItemId }].map((c) => ({
      itemId: c.itemId,
      locationId: order.locationId,
    })),
  );
  const current = await tx
    .select()
    .from(items)
    .where(
      inArray(items.id, [
        ...composition.components.map((c) => c.itemId),
        order.outputItemId,
      ]),
    );
  if (!current.find((i) => i.id === order.outputItemId)?.stockTracked)
    fail("El preparado debe controlar inventario.");
  for (const c of composition.components) {
    const item = current.find((i) => i.id === c.itemId);
    if (!item?.recipeUsable || item.class === "unclassified")
      fail("Hay componentes que ya no están habilitados para recetas.");
  }
  composition.untracked = current
    .filter(
      (i) =>
        !i.stockTracked &&
        composition.components.some((c) => c.itemId === i.id),
    )
    .map((i) => ({ itemId: i.id, unitCost: i.unitCost }));
  const [document] = await tx
    .select()
    .from(stockDocuments)
    .where(
      and(
        eq(stockDocuments.productionOrderId, id),
        eq(stockDocuments.branchId, ctx.branchId),
      ),
    );
  if (!document) fail("Falta el documento de producción.");
  await reserveStock(tx, ctx, {
    operationId,
    documentId: document.id,
    demands: composition.components.map((c) => ({
      ...c,
      locationId: order.locationId,
    })),
  });
  await tx
    .update(productionOrders)
    .set({
      state: "confirmed",
      startedBy: ctx.actorId,
      startedAt: new Date(),
      composition,
      revision: order.revision + 1,
    })
    .where(eq(productionOrders.id, id));
  await tx
    .insert(auditEvents)
    .values({
      actorId: ctx.actorId,
      entity: "production-orders",
      recordId: id,
      action: "start",
      after: { operationId, assignedTo: order.assignedTo },
    });
  return { id, revision: order.revision + 1 };
}

export async function reviseProduction(
  tx: Tx,
  ctx: OperationalContext,
  operationId: string,
  id: string,
  raw: unknown,
) {
  productionManager(ctx);
  const input = assignmentSchema
    .extend({
      expectedRevision: z.number().int().positive(),
      plannedQuantity: z
        .string()
        .regex(/^\d{1,12}\.\d{6}$/)
        .refine((v) => integer(v) > 0n),
      reason: z.string().trim().min(1).max(2000),
    })
    .parse(raw);
  const order = await lockedProduction(tx, ctx, id, input.expectedRevision);
  if (!["planned", "confirmed"].includes(order.state))
    fail("La orden ya terminó.");
  await requireAssignee(tx, ctx.branchId, input.assignedTo);
  const composition = order.composition as Composition;
  if (input.plannedQuantity !== order.plannedQuantity) {
    if (order.state !== "planned")
      fail("La cantidad solo se puede cambiar antes de comenzar.");
    const [version] = await tx
      .select()
      .from(recipeVersions)
      .where(eq(recipeVersions.id, order.recipeVersionId));
    const ids = composition.selections.flatMap((s) =>
      s.optionId ? [s.optionId] : [],
    );
    const options = ids.length
      ? await tx
          .select()
          .from(recipeOptions)
          .where(inArray(recipeOptions.id, ids))
      : [];
    if (!version || options.length !== ids.length)
      fail("No se encontró la receta original.");
    composition.components = options.map((o) => ({
      itemId: o.itemId,
      quantity: consumptionQuantity(
        o.quantity,
        o.wastePercent,
        integer(input.plannedQuantity),
        integer(version.yieldQuantity),
      ),
    }));
  }
  const next = {
    assignedTo: input.assignedTo,
    scheduledFor: input.scheduledFor,
    notes: input.notes,
    plannedQuantity: input.plannedQuantity,
  };
  await tx
    .update(productionOrders)
    .set({ ...next, composition, revision: order.revision + 1 })
    .where(eq(productionOrders.id, id));
  await tx
    .insert(auditEvents)
    .values({
      actorId: ctx.actorId,
      entity: "production-orders",
      recordId: id,
      action: "revise",
      before: {
        assignedTo: order.assignedTo,
        scheduledFor: order.scheduledFor,
        plannedQuantity: order.plannedQuantity,
        notes: order.notes,
      },
      after: { ...next, operationId, reason: input.reason },
    });
  return { id, revision: order.revision + 1 };
}

export async function cancelPlannedProduction(
  tx: Tx,
  ctx: OperationalContext,
  operationId: string,
  id: string,
  raw: unknown,
) {
  productionManager(ctx);
  const input = z
    .object({
      expectedRevision: z.number().int().positive(),
      reason: z.string().trim().min(1).max(2000),
    })
    .strict()
    .parse(raw);
  const order = await lockedProduction(tx, ctx, id, input.expectedRevision);
  if (order.state !== "planned")
    fail(
      "La orden ya comenzó. Revisá los materiales consumidos antes de anularla.",
    );
  await tx
    .update(productionOrders)
    .set({
      state: "cancelled",
      completedAt: new Date(),
      completedBy: ctx.actorId,
      revision: order.revision + 1,
    })
    .where(eq(productionOrders.id, id));
  await tx
    .insert(auditEvents)
    .values({
      actorId: ctx.actorId,
      entity: "production-orders",
      recordId: id,
      action: "cancel-planned",
      after: { operationId, reason: input.reason },
    });
  return { id, revision: order.revision + 1 };
}
