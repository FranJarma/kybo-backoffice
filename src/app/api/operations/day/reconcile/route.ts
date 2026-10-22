import { getDb } from "@/db/client";
import { operationalActor } from "@/modules/branches/http";
import {
  errorResponse,
  privateJson,
  requestInput,
} from "@/modules/catalog/http";
import { reconcileDailyOperations } from "@/modules/daily-operations/reconcile";
import { dailyOperationError } from "@/modules/daily-operations/http";
export async function POST(request: Request) {
  try {
    const actor = await operationalActor(request);
    const input = await requestInput(request);
    return privateJson(
      await reconcileDailyOperations(await getDb(), actor, input),
    );
  } catch (e) {
    return errorResponse(dailyOperationError(e));
  }
}
