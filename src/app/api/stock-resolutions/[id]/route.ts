import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import {
  stockResolutions,
  stockResolutionLines,
} from "@/db/stock-resolution-schema";
import { inventoryResponse } from "@/modules/inventory/http";
import { executeCommand } from "@/modules/operations/command";
import { resolveCancellation } from "@/modules/fulfillment/cancellation";
import { AppError } from "@/lib/errors";
import { reservationAllocations } from "@/db/reservation-schema";
import { items } from "@/db/item-schema";
type Params = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Params) {
  return inventoryResponse(null, async (actor) => {
    const db = await getDb(),
      { id } = await params;
    const [resolution] = await db
      .select()
      .from(stockResolutions)
      .where(
        and(
          eq(stockResolutions.id, z.uuid().parse(id)),
          eq(stockResolutions.branchId, actor.branchId!),
        ),
      );
    if (!resolution)
      throw new AppError(
        "NOT_FOUND",
        "La resolución no pertenece a esta sucursal.",
        404,
      );
    const rows = await db
      .select({ line: stockResolutionLines, itemName: items.name })
      .from(stockResolutionLines)
      .innerJoin(
        reservationAllocations,
        eq(reservationAllocations.id, stockResolutionLines.allocationId),
      )
      .innerJoin(items, eq(items.id, reservationAllocations.itemId))
      .where(eq(stockResolutionLines.resolutionId, id));
    const lines = rows.map((r) => ({ ...r.line, itemName: r.itemName }));
    return { ...resolution, lines };
  });
}
export async function POST(request: Request, { params }: Params) {
  return inventoryResponse(request, async (actor, raw) => {
    const { id } = await params;
    const input = z
      .object({
        requestId: z.uuid(),
        expectedRevision: z.number().int().positive(),
        reason: z.string().trim().min(1).max(2000),
        lines: z
          .array(
            z
              .object({
                resolutionLineId: z.uuid(),
                consumed: z.string(),
                unused: z.string(),
              })
              .strict(),
          )
          .min(1)
          .max(100),
      })
      .strict()
      .parse(raw);
    return executeCommand(
      await getDb(),
      actor,
      actor.branchId!,
      input,
      "resolve-cancellation",
      { id, ...input },
      (tx, ctx, operationId) =>
        resolveCancellation(tx, ctx, {
          ...input,
          resolutionId: z.uuid().parse(id),
          operationId,
        }),
    );
  });
}
