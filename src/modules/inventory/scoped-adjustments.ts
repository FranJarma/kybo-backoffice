import { and, eq, sql } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";
import { inventoryLots } from "@/db/inventory-schema";
import { items } from "@/db/item-schema";
import {
  inventoryValuations,
  lotLocationBalances,
  stockBlockEvents,
} from "@/db/stock-schema";
import {
  stockAdjustments,
  stockDocuments,
} from "@/db/inventory-document-schema";
import {
  reservationAllocations,
  stockReservations,
} from "@/db/reservation-schema";
import { executeCommand } from "../operations/command";
import { lockStock } from "./locking";
import { postMovement } from "./ledger";
import { parseAdjustment } from "./validation";
import { businessDate } from "../operations/business-date";
import { integer, six, roundedDivision, SCALE } from "./decimal";
import { scopedLot } from "./scoped-queries";
import { AppError } from "@/lib/errors";
function fail(message: string): never {
  throw new AppError("STOCK_CONFLICT", message, 409);
}
export async function adjustAt(
  db: AppDb,
  actor: Actor,
  raw: unknown,
  now: Date,
) {
  const input = parseAdjustment(raw);
  const outcome = await executeCommand(
    db,
    actor,
    actor.branchId ?? "",
    input,
    "adjust",
    input,
    async (tx, ctx, operationId) => {
      if (ctx.role === "staff")
        throw new AppError(
          "FORBIDDEN",
          "Se requiere permiso de encargado.",
          403,
        );
      const today = businessDate(now, ctx.timeZone);
      let lotId: string,
        itemId: string,
        delta: bigint,
        incoming: bigint | null = null;
      if (input.kind === "opening") {
        if (input.receivedOn > today) fail("La fecha no puede ser futura.");
        itemId = input.itemId;
        await lockStock(tx, ctx, [{ itemId, locationId: input.locationId }]);
        delta = integer(input.quantity!);
        incoming =
          input.unitCost === null
            ? null
            : roundedDivision(delta * integer(input.unitCost), SCALE);
        const [lot] = await tx
          .insert(inventoryLots)
          .values({
            itemId,
            receivedOn: input.receivedOn,
            expiresOn: input.expiresOn,
            lotCode: input.lotCode,
            initialQuantity: six(delta),
            remainingQuantity: six(delta),
          })
          .returning();
        lotId = lot.id;
      } else {
        const [lot] = await tx
          .select()
          .from(inventoryLots)
          .where(eq(inventoryLots.id, input.lotId));
        if (!lot) fail("El lote no existe.");
        itemId = lot.itemId;
        lotId = lot.id;
        await lockStock(
          tx,
          ctx,
          [{ itemId, locationId: input.locationId }],
          true,
        );
        const [balance] = await tx
          .select()
          .from(lotLocationBalances)
          .where(
            and(
              eq(lotLocationBalances.lotId, lotId),
              eq(lotLocationBalances.locationId, input.locationId),
              eq(lotLocationBalances.branchId, ctx.branchId),
            ),
          )
          .for("update");
        if (!balance || balance.revision !== input.revision)
          fail("El lote cambió. Actualizá sus existencias.");
        if (input.kind === "block") {
          if (balance.blocked === input.blocked) fail("El estado ya cambió.");
          await tx
            .update(lotLocationBalances)
            .set({ blocked: input.blocked, revision: balance.revision + 1 })
            .where(
              and(
                eq(lotLocationBalances.lotId, lotId),
                eq(lotLocationBalances.locationId, input.locationId),
              ),
            );
          await tx.insert(stockBlockEvents).values({
            operationId,
            lotId,
            locationId: input.locationId,
            blocked: input.blocked,
            reason: input.reason,
          });
          if (input.blocked) {
            const affected = await tx
              .select({ id: reservationAllocations.reservationId })
              .from(reservationAllocations)
              .where(
                and(
                  eq(reservationAllocations.lotId, lotId),
                  eq(reservationAllocations.locationId, input.locationId),
                  sql`${reservationAllocations.allocated} > ${reservationAllocations.consumed}+${reservationAllocations.released}`,
                ),
              );
            for (const r of affected)
              await tx
                .update(stockReservations)
                .set({ state: "affected" })
                .where(eq(stockReservations.id, r.id));
          }
          return {
            lot: await scopedLot(tx, ctx, lotId, input.locationId, now),
          };
        }
        if (input.kind === "count" && integer(balance.reserved) > 0n)
          fail(
            "Resolvé las reservas o preparaciones en curso antes de contar este lote.",
          );
        delta =
          input.kind === "waste"
            ? -integer(input.quantity!)
            : integer(input.countedQuantity!) - integer(balance.quantity);
        if (delta === 0n) fail("El conteo no modifica la cantidad.");
        if (delta > 0n) {
          const [item] = await tx
            .select()
            .from(items)
            .where(eq(items.id, itemId));
          if (item.archivedAt) fail("El artículo está archivado.");
          const [value] = await tx
            .select()
            .from(inventoryValuations)
            .where(
              and(
                eq(inventoryValuations.itemId, itemId),
                eq(inventoryValuations.branchId, ctx.branchId),
              ),
            );
          incoming =
            value.value === null || integer(value.quantity) === 0n
              ? null
              : roundedDivision(
                  integer(value.value) * delta,
                  integer(value.quantity),
                );
        }
      }
      const [adjustment] = await tx
        .insert(stockAdjustments)
        .values({
          branchId: ctx.branchId,
          actorId: ctx.actorId,
          kind: input.kind,
          reason: input.reason,
        })
        .returning();
      const [document] = await tx
        .insert(stockDocuments)
        .values({
          branchId: ctx.branchId,
          kind: "adjustment",
          adjustmentId: adjustment.id,
        })
        .returning();
      await postMovement(tx, ctx, {
        operationId,
        documentId: document.id,
        action: input.kind,
        reason: input.reason,
        legs: [
          {
            itemId,
            lotId,
            locationId: input.locationId,
            quantity: six(delta < 0n ? -delta : delta),
            direction: delta > 0n ? "in" : "out",
            incomingValue: incoming === null ? null : six(incoming),
          },
        ],
      });
      return { lot: await scopedLot(tx, ctx, lotId, input.locationId, now) };
    },
  );
  return outcome.result;
}
