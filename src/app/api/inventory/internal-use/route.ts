import { z } from "zod";
import { getDb } from "@/db/client";
import { inventoryResponse } from "@/modules/inventory/http";
import { executeCommand } from "@/modules/operations/command";
import { recordInternalUse } from "@/modules/inventory/internal-use";
export async function POST(request: Request) {
  return inventoryResponse(request, async (actor, raw) => {
    const input = z
      .object({
        requestId: z.uuid(),
        reason: z.string().trim().min(1).max(2000),
        allocations: z
          .array(
            z
              .object({
                itemId: z.uuid(),
                lotId: z.uuid(),
                locationId: z.uuid(),
                quantity: z.string(),
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
      "internal-use",
      input,
      (tx, ctx, operationId) =>
        recordInternalUse(tx, ctx, { ...input, operationId }),
    );
  });
}
