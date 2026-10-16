import { z } from "zod";
import { getDb } from "@/db/client";
import { productionResponse } from "@/modules/production/http";
import {
  startProduction,
  reviseProduction,
  cancelPlannedProduction,
} from "@/modules/production/planning";
import { executeCommand } from "@/modules/operations/command";
import { reviewProductionResult } from "@/modules/production/review-result";
import {
  finishProduction,
  cancelUnusedProduction,
} from "@/modules/production/orders";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return productionResponse(request, async (actor, raw) => {
    const { id } = await params;
    z.uuid().parse(id);
    const input = z
      .union([
        z.object({ requestId: z.uuid(), completion: z.unknown() }).strict(),
        z.object({ requestId: z.uuid(), cancellation: z.unknown() }).strict(),
        z.object({ requestId: z.uuid(), start: z.unknown() }).strict(),
        z.object({ requestId: z.uuid(), planning: z.unknown() }).strict(),
        z.object({ requestId: z.uuid(), cancelPlan: z.unknown() }).strict(),
        z.object({ requestId: z.uuid(), review: z.unknown() }).strict(),
      ])
      .parse(raw);
    if ("review" in input)
      return executeCommand(
        await getDb(),
        actor,
        actor.branchId!,
        input,
        "production-review",
        { id, ...input },
        (tx, ctx, op) => reviewProductionResult(tx, ctx, op, id, input.review),
      );
    if ("start" in input)
      return executeCommand(
        await getDb(),
        actor,
        actor.branchId!,
        input,
        "production-start",
        { id, ...input },
        (tx, ctx, op) => startProduction(tx, ctx, op, id, input.start),
      );
    if ("planning" in input)
      return executeCommand(
        await getDb(),
        actor,
        actor.branchId!,
        input,
        "production-revise",
        { id, ...input },
        (tx, ctx, op) => reviseProduction(tx, ctx, op, id, input.planning),
      );
    if ("cancelPlan" in input)
      return executeCommand(
        await getDb(),
        actor,
        actor.branchId!,
        input,
        "production-cancel-plan",
        { id, ...input },
        (tx, ctx, op) =>
          cancelPlannedProduction(tx, ctx, op, id, input.cancelPlan),
      );
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
    const response = await executeCommand(
      await getDb(),
      actor,
      actor.branchId!,
      input,
      "production-finish",
      { id, ...input },
      (tx, ctx, operationId) =>
        finishProduction(tx, ctx, operationId, id, input.completion),
    );
    if (actor.role !== "staff") return response;
    const { totalCost: _cost, ...result } = response.result;
    void _cost;
    return { ...response, result };
  });
}
