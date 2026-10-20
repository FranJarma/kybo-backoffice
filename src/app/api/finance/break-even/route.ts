import { getDb } from "@/db/client";
import { operationalActor } from "@/modules/branches/http";
import { errorResponse, privateJson } from "@/modules/catalog/http";
import { getBreakEven } from "@/modules/overheads/break-even-service";

export async function GET(request: Request) {
  try {
    const actor = await operationalActor(request);
    return privateJson(
      await getBreakEven(
        await getDb(),
        actor,
        new URL(request.url).searchParams.get("month") ?? undefined,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
