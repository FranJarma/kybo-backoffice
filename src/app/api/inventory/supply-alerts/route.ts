import { z } from "zod";
import { getDb } from "@/db/client";
import { operationalActor } from "@/modules/branches/http";
import {
  errorResponse,
  privateJson,
  requestInput,
} from "@/modules/catalog/http";
import { executeCommand } from "@/modules/operations/command";
import {
  getSupplySnapshot,
  saveSupplyPolicy,
} from "@/modules/supply-alerts/service";
import { AppError } from "@/lib/errors";
async function manager(request: Request) {
  const actor = await operationalActor(request);
  if (actor.role === "staff")
    throw new AppError(
      "FORBIDDEN",
      "Solo el encargado puede configurar compras anticipadas.",
      403,
    );
  return actor;
}
export async function GET(request: Request) {
  try {
    return privateJson(
      await getSupplySnapshot(await getDb(), await manager(request)),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await manager(request);
    const input = z
      .object({ requestId: z.uuid(), policy: z.unknown() })
      .strict()
      .parse(await requestInput(request));
    return privateJson(
      await executeCommand(
        await getDb(),
        actor,
        actor.branchId!,
        input,
        "supply-alert-policy",
        input,
        (tx, context, op) => saveSupplyPolicy(tx, context, op, input.policy),
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
