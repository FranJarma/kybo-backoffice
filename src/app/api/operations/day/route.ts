import { getDb } from "@/db/client";
import { operationalActor } from "@/modules/branches/http";
import { errorResponse, privateJson } from "@/modules/catalog/http";
import { getDailyOperationSnapshot } from "@/modules/daily-operations/queries";
import { dailyOperationError } from "@/modules/daily-operations/http";
import { dayFiltersSchema } from "@/modules/daily-operations/validation";
export async function GET(request: Request) {
  try {
    const actor = await operationalActor(request),
      q = new URL(request.url).searchParams;
    const filters = dayFiltersSchema.parse({
      mine: q.has("mine") ? q.get("mine") === "true" : actor.role === "staff",
      history: q.get("history") === "true",
      offset: Number(q.get("offset") ?? 0),
      locationId: q.get("locationId") || undefined,
      assignedTo: q.get("assignedTo") || undefined,
      kind: q.get("kind") || undefined,
      urgency: q.get("urgency") || undefined,
    });
    return privateJson(
      await getDailyOperationSnapshot(await getDb(), actor, filters),
    );
  } catch (e) {
    return errorResponse(dailyOperationError(e));
  }
}
