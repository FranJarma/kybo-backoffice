import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import {
  reservationAllocations,
  stockReservations,
} from "@/db/reservation-schema";
import { inventoryLots } from "@/db/inventory-schema";
import { items } from "@/db/item-schema";
import { inventoryResponse } from "@/modules/inventory/http";
import { executeCommand } from "@/modules/operations/command";
import { reassignReservation } from "@/modules/inventory/reassignment";
export async function GET(request: Request) {
  return inventoryResponse(null, async (actor) => {
    const offset = z.coerce
      .number()
      .int()
      .min(0)
      .max(1000000)
      .parse(new URL(request.url).searchParams.get("offset") ?? 0);
    const rows = await (
      await getDb()
    )
      .select({
        allocation: reservationAllocations,
        state: stockReservations.state,
        itemName: items.name,
        lotCode: inventoryLots.lotCode,
      })
      .from(reservationAllocations)
      .innerJoin(
        stockReservations,
        eq(stockReservations.id, reservationAllocations.reservationId),
      )
      .innerJoin(items, eq(items.id, reservationAllocations.itemId))
      .innerJoin(
        inventoryLots,
        eq(inventoryLots.id, reservationAllocations.lotId),
      )
      .where(
        and(
          eq(reservationAllocations.branchId, actor.branchId!),
          sql`${reservationAllocations.allocated}>${reservationAllocations.consumed}+${reservationAllocations.released}`,
        ),
      )
      .orderBy(reservationAllocations.id)
      .limit(101)
      .offset(offset);
    return { rows: rows.slice(0, 100), hasMore: rows.length > 100 };
  });
}
export async function POST(request: Request) {
  return inventoryResponse(request, async (actor, raw) => {
    const input = z
      .object({
        requestId: z.uuid(),
        allocationId: z.uuid(),
        replacementLotId: z.uuid(),
        quantity: z.string().regex(/^\d{1,12}\.\d{6}$/),
        reason: z.string().trim().min(1).max(2000),
      })
      .strict()
      .parse(raw);
    return executeCommand(
      await getDb(),
      actor,
      actor.branchId!,
      input,
      "reservation-reassign",
      input,
      (tx, ctx, operationId) =>
        reassignReservation(tx, ctx, { ...input, operationId }),
    );
  });
}
