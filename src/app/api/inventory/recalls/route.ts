import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { inventoryLots } from "@/db/inventory-schema";
import { items } from "@/db/item-schema";
import { lotLocationBalances, stockBlockEvents } from "@/db/stock-schema";
import {
  reservationAllocations,
  stockReservations,
} from "@/db/reservation-schema";
import { inventoryResponse } from "@/modules/inventory/http";
import { executeCommand } from "@/modules/operations/command";
import { AppError } from "@/lib/errors";
export async function POST(request: Request) {
  return inventoryResponse(request, async (actor, raw) => {
    const input = z
      .object({
        requestId: z.uuid(),
        lotId: z.uuid(),
        expectedRevision: z.number().int().positive(),
        blocked: z.boolean(),
        reason: z.string().trim().min(1).max(2000),
      })
      .strict()
      .parse(raw);
    return executeCommand(
      await getDb(),
      actor,
      actor.branchId!,
      input,
      "global-lot-recall",
      input,
      async (tx, ctx, operationId) => {
        if (ctx.role !== "admin")
          throw new AppError(
            "FORBIDDEN",
            "Solo un administrador puede retirar un lote de todas las sucursales.",
            403,
          );
        const [identity] = await tx
          .select()
          .from(inventoryLots)
          .where(eq(inventoryLots.id, input.lotId));
        if (!identity)
          throw new AppError("NOT_FOUND", "El lote no existe.", 404);
        await tx
          .select()
          .from(items)
          .where(eq(items.id, identity.itemId))
          .for("update");
        const [lot] = await tx
          .select()
          .from(inventoryLots)
          .where(eq(inventoryLots.id, input.lotId))
          .for("update");
        if (
          lot.revision !== input.expectedRevision ||
          lot.blocked === input.blocked
        )
          throw new AppError(
            "CONFLICT",
            "El lote cambió. Actualizá sus datos.",
            409,
          );
        const rows = await tx
          .select()
          .from(lotLocationBalances)
          .where(eq(lotLocationBalances.lotId, lot.id))
          .orderBy(lotLocationBalances.locationId)
          .for("update");
        await tx
          .update(inventoryLots)
          .set({ blocked: input.blocked, revision: lot.revision + 1 })
          .where(eq(inventoryLots.id, lot.id));
        for (const row of rows) {
          await tx
            .insert(stockBlockEvents)
            .values({
              operationId,
              lotId: lot.id,
              locationId: row.locationId,
              blocked: input.blocked,
              reason: input.reason,
            });
          await tx
            .update(lotLocationBalances)
            .set({ revision: row.revision + 1 })
            .where(
              and(
                eq(lotLocationBalances.lotId, lot.id),
                eq(lotLocationBalances.locationId, row.locationId),
              ),
            );
        }
        if (input.blocked) {
          const affected = await tx
            .select({ id: reservationAllocations.reservationId })
            .from(reservationAllocations)
            .where(
              and(
                eq(reservationAllocations.lotId, lot.id),
                sql`${reservationAllocations.allocated}>${reservationAllocations.consumed}+${reservationAllocations.released}`,
              ),
            );
          for (const r of affected)
            await tx
              .update(stockReservations)
              .set({ state: "affected" })
              .where(eq(stockReservations.id, r.id));
        }
        return { id: lot.id, revision: lot.revision + 1 };
      },
    );
  });
}

export async function GET(request: Request) {
  return inventoryResponse(null, async (actor) => {
    if (actor.role !== "admin")
      throw new AppError(
        "FORBIDDEN",
        "Solo un administrador puede consultar retiros globales.",
        403,
      );
    const query = new URL(request.url).searchParams,
      itemId = z.uuid().parse(query.get("itemId")),
      offset = z.coerce
        .number()
        .int()
        .min(0)
        .max(1000000)
        .parse(query.get("offset") ?? 0);
    const page = await (
      await getDb()
    )
      .select({
        id: inventoryLots.id,
        lotCode: inventoryLots.lotCode,
        receivedOn: inventoryLots.receivedOn,
        blocked: inventoryLots.blocked,
        revision: inventoryLots.revision,
      })
      .from(inventoryLots)
      .where(eq(inventoryLots.itemId, itemId))
      .orderBy(inventoryLots.id)
      .limit(101)
      .offset(offset);
    return { rows: page.slice(0, 100), hasMore: page.length > 100 };
  });
}
