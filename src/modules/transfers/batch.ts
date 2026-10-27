import { z } from "zod";
import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { executeCommand } from "../operations/command";
import { lockStock } from "../inventory/locking";
import { assertStockAvailable } from "../inventory/stock-shortages";
import { integer, safeQuantity } from "../inventory/decimal";
import {
  confirmTransferInTransaction,
  dispatchTransferInTransaction,
} from "./service";

const batchSchema = z
  .object({
    requestId: z.uuid(),
    originLocationId: z.uuid(),
    reason: z.string().trim().min(1).max(2000),
    lines: z
      .array(
        z
          .object({
            itemId: z.uuid(),
            destinationLocationId: z.uuid(),
            quantity: z.string().regex(/^\d{1,12}\.\d{6}$/),
          })
          .strict(),
      )
      .min(1)
      .max(100),
  })
  .strict();

export async function confirmTransferBatch(
  db: AppDb,
  actor: Actor,
  branchId: string,
  raw: unknown,
) {
  const input = batchSchema.parse(raw);
  return executeCommand(
    db,
    actor,
    branchId,
    input,
    "transfer-batch",
    input,
    async (tx, ctx, operationId) => {
      const totals = new Map<string, bigint>();
      for (const line of input.lines) {
        const quantity = integer(line.quantity);
        if (quantity <= 0n)
          throw new AppError(
            "VALIDATION",
            "Las cantidades deben ser positivas.",
            400,
          );
        totals.set(line.itemId, quantity + (totals.get(line.itemId) ?? 0n));
      }
      const demands = [...totals].map(([itemId, quantity]) => ({
        itemId,
        quantity: safeQuantity(quantity),
        locationId: input.originLocationId,
      }));
      const tracked = await lockStock(tx, ctx, demands);
      if (demands.some((demand) => !tracked.has(demand.itemId)))
        throw new AppError(
          "ITEM_UNAVAILABLE",
          "Solo podés trasladar insumos que controlan inventario.",
          409,
        );
      // Check the total before any destination is posted, so shortages describe the whole batch.
      await assertStockAvailable(tx, ctx, demands, tracked);
      const grouped = new Map<string, { itemId: string; quantity: string }[]>();
      for (const line of input.lines) {
        const group = grouped.get(line.destinationLocationId) ?? [];
        group.push({ itemId: line.itemId, quantity: line.quantity });
        grouped.set(line.destinationLocationId, group);
      }
      const transfers: {
        id: string;
        revision: number;
        destinationLocationId: string;
      }[] = [];
      for (const [destinationLocationId, rows] of [...grouped].sort(
        ([a], [b]) => a.localeCompare(b),
      )) {
        const transfer = await confirmTransferInTransaction(
          tx,
          ctx,
          operationId,
          {
            requestId: input.requestId,
            originLocationId: input.originLocationId,
            destinationLocationId,
            reason: input.reason,
            demands: rows,
          },
        );
        const dispatched = await dispatchTransferInTransaction(
          tx,
          ctx,
          operationId,
          transfer.id,
          {
            requestId: input.requestId,
            expectedRevision: transfer.revision,
          },
        );
        transfers.push({ ...dispatched, destinationLocationId });
      }
      return { transfers };
    },
  );
}
