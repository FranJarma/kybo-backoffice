import { z } from "zod";
import { getDb } from "@/db/client";
import { salesResponse } from "@/modules/sales/http";
import { executeCommand } from "@/modules/operations/command";
import {
  completePreparation,
  deliverLines,
} from "@/modules/fulfillment/service";
import { AppError } from "@/lib/errors";
import { returnResale } from "@/modules/fulfillment/returns";
import { stockMovements } from "@/db/stock-movement-schema";
import { stockDocuments, stockReturns } from "@/db/inventory-document-schema";
import { inventoryLots } from "@/db/inventory-schema";
import { integer, six } from "@/modules/inventory/decimal";
import { and, eq, inArray } from "drizzle-orm";
import { sales, saleOrders, saleLines } from "@/db/sales-schema";
import { saleLineFulfillments } from "@/db/fulfillment-event-schema";
import {
  preparationTaskLines,
  preparationTasks,
} from "@/db/preparation-schema";
import { stockResolutions } from "@/db/stock-resolution-schema";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  return salesResponse(null, async (actor) => {
    if ((await params).action !== "state")
      throw new AppError("NOT_FOUND", "La consulta no existe.", 404);
    const saleId = z
        .uuid()
        .parse(new URL(request.url).searchParams.get("saleId")),
      db = await getDb();
    const [sale] = await db
      .select()
      .from(sales)
      .where(and(eq(sales.id, saleId), eq(sales.branchId, actor.branchId!)));
    if (!sale)
      throw new AppError(
        "NOT_FOUND",
        "La venta no existe en esta sucursal.",
        404,
      );
    const rows = await db
      .select({
        lineId: saleLines.id,
        name: saleLines.name,
        orderId: saleOrders.id,
        progress: saleLineFulfillments,
        task: preparationTasks,
      })
      .from(saleLines)
      .innerJoin(saleOrders, eq(saleOrders.id, saleLines.orderId))
      .innerJoin(
        saleLineFulfillments,
        eq(saleLineFulfillments.saleLineId, saleLines.id),
      )
      .leftJoin(
        preparationTaskLines,
        eq(preparationTaskLines.lineId, saleLines.id),
      )
      .leftJoin(
        preparationTasks,
        eq(preparationTasks.id, preparationTaskLines.taskId),
      )
      .where(eq(saleOrders.saleId, saleId))
      .orderBy(saleOrders.sequence, saleLines.position);
    const [resolution] = await db
      .select({ id: stockResolutions.id, state: stockResolutions.state })
      .from(stockResolutions)
      .where(
        and(
          eq(stockResolutions.saleId, saleId),
          eq(stockResolutions.branchId, actor.branchId!),
        ),
      );
    const direct = rows.filter((r) => r.progress.mode === "direct");
    const dispatched =
      actor.role !== "staff" && direct.length
        ? await db
            .select({
              movement: stockMovements,
              lotCode: inventoryLots.lotCode,
            })
            .from(stockMovements)
            .innerJoin(
              inventoryLots,
              eq(inventoryLots.id, stockMovements.lotId),
            )
            .where(
              and(
                inArray(
                  stockMovements.documentId,
                  direct.map((r) => r.progress.documentId),
                ),
                eq(stockMovements.action, "direct_dispatch"),
              ),
            )
        : [];
    const returned =
      actor.role !== "staff" && direct.length
        ? await db
            .select({
              lineId: stockReturns.saleLineId,
              movement: stockMovements,
            })
            .from(stockReturns)
            .innerJoin(
              stockDocuments,
              eq(stockDocuments.returnId, stockReturns.id),
            )
            .innerJoin(
              stockMovements,
              eq(stockMovements.documentId, stockDocuments.id),
            )
            .where(
              inArray(
                stockReturns.saleLineId,
                direct.map((r) => r.lineId),
              ),
            )
        : [];
    return {
      rows: rows.map((row) => ({
        ...row,
        returnLots: [
          ...new Set(
            dispatched
              .filter((d) => d.movement.documentId === row.progress.documentId)
              .map((d) => d.movement.lotId),
          ),
        ]
          .map((lotId) => {
            const original = dispatched.filter(
              (d) =>
                d.movement.documentId === row.progress.documentId &&
                d.movement.lotId === lotId,
            );
            return {
              lotId,
              lotCode: original[0].lotCode,
              quantity: six(
                -original.reduce(
                  (s, d) => s + integer(d.movement.quantity),
                  0n,
                ) -
                  returned
                    .filter(
                      (r) =>
                        r.lineId === row.lineId && r.movement.lotId === lotId,
                    )
                    .reduce((s, r) => s + integer(r.movement.quantity), 0n),
              ),
            };
          })
          .filter((l) => integer(l.quantity) > 0n),
      })),
      cancelled: sale.status === "cancelled",
      resolution: resolution ?? null,
    };
  });
}
const lines = z
  .array(
    z
      .object({ saleLineId: z.uuid(), quantity: z.number().int().positive() })
      .strict(),
  )
  .min(1)
  .max(50);
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  return salesResponse(request, async (actor, raw) => {
    const { action } = await params,
      db = await getDb();
    if (action === "return") {
      const input = z
        .object({
          requestId: z.uuid(),
          saleLineId: z.uuid(),
          lotId: z.uuid(),
          locationId: z.uuid(),
          quantity: z.string().regex(/^\d{1,12}\.\d{6}$/),
          reason: z.string().trim().min(1).max(2000),
        })
        .strict()
        .parse(raw);
      return executeCommand(
        db,
        actor,
        actor.branchId!,
        input,
        "return",
        input,
        (tx, ctx, operationId) =>
          returnResale(tx, ctx, { ...input, operationId }),
      );
    }
    if (action === "complete") {
      const input = z
        .object({
          requestId: z.uuid(),
          taskId: z.uuid(),
          expectedRevision: z.number().int().positive(),
          lines,
        })
        .strict()
        .parse(raw);
      return executeCommand(
        db,
        actor,
        actor.branchId!,
        input,
        "complete",
        input,
        (tx, ctx, operationId) =>
          completePreparation(tx, ctx, { ...input, operationId }),
      );
    }
    if (action === "deliver") {
      const input = z
        .object({ requestId: z.uuid(), orderId: z.uuid(), lines })
        .strict()
        .parse(raw);
      return executeCommand(
        db,
        actor,
        actor.branchId!,
        input,
        "deliver",
        input,
        async (tx, ctx, operationId) => {
          await deliverLines(tx, ctx, { ...input, operationId });
          return { delivered: true };
        },
      );
    }
    throw new AppError("NOT_FOUND", "La acción no existe.", 404);
  });
}
