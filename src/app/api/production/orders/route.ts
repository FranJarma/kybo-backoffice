import { z } from "zod";
import { getDb } from "@/db/client";
import { productionResponse } from "@/modules/production/http";
import { executeCommand } from "@/modules/operations/command";
import { planProduction } from "@/modules/production/planning";
import { listProductionOrders } from "@/modules/production/queries";
export async function GET(request: Request) {
  return productionResponse(request, async (actor) => {
    const query = new URL(request.url).searchParams;
    const offset = z.coerce
      .number()
      .int()
      .min(0)
      .max(1_000_000)
      .parse(query.get("offset") ?? 0);
    return listProductionOrders(
      await getDb(),
      actor,
      query.get("scope") ?? "active",
      offset,
      query.get("mine") === "true",
    );
  });
}
export async function POST(request: Request) {
  return productionResponse(request, async (actor, raw) => {
    const input = z
      .object({
        requestId: z.uuid(),
        order: z.unknown(),
        assignment: z.unknown(),
      })
      .strict()
      .parse(raw);
    return executeCommand(
      await getDb(),
      actor,
      actor.branchId!,
      input,
      "production-plan",
      input,
      (tx, ctx, operationId) =>
        planProduction(tx, ctx, operationId, input.order, input.assignment),
    );
  });
}
