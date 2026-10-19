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
  getReplenishmentSnapshot,
  saveReplenishmentPolicy,
} from "@/modules/replenishment/service";
import { replenishmentError } from "@/modules/replenishment/http";
import { AppError } from "@/lib/errors";

export async function GET(request: Request) {
  try {
    const actor = await operationalActor(request);
    return privateJson(await getReplenishmentSnapshot(await getDb(), actor));
  } catch (error) {
    return errorResponse(replenishmentError(error));
  }
}

export async function POST(request: Request) {
  try {
    const actor = await operationalActor(request);
    if (actor.role === "staff")
      throw new AppError(
        "FORBIDDEN",
        "Solo el encargado puede configurar los avisos.",
        403,
      );
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
        "replenishment-policy",
        input,
        (tx, ctx, operationId) =>
          saveReplenishmentPolicy(tx, ctx, operationId, input.policy),
      ),
    );
  } catch (error) {
    return errorResponse(replenishmentError(error));
  }
}
