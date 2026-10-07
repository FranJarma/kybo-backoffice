import { z } from "zod";
import { getDb } from "@/db/client";
import { inventoryResponse } from "@/modules/inventory/http";
import { executeCommand } from "@/modules/operations/command";
import {
  finishProduction,
  cancelUnusedProduction,
} from "@/modules/production/orders";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return inventoryResponse(request, async (actor, raw) => {
    const { id } = await params;
    z.uuid().parse(id);
    const input = z
      .union([
        z.object({ requestId: z.uuid(), completion: z.unknown() }).strict(),
        z.object({ requestId: z.uuid(), cancellation: z.unknown() }).strict(),
      ])
      .parse(raw);
    if ("cancellation" in input)
      return executeCommand(
        await getDb(),
        actor,
        actor.branchId!,
        input,
        "production-cancel",
        { id, ...input },
        (tx, ctx, operationId) =>
          cancelUnusedProduction(tx, ctx, operationId, id, input.cancellation),
      );
    return executeCommand(
      await getDb(),
      actor,
      actor.branchId!,
      input,
      "production-finish",
      { id, ...input },
      (tx, ctx, operationId) =>
        finishProduction(tx, ctx, operationId, id, input.completion),
    );
  });
}
