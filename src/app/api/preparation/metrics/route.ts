import { getDb } from "@/db/client";
import { businessDate } from "@/modules/inventory/service";
import { createPreparationService } from "@/modules/preparation/service";
import { preparationResponse } from "@/modules/preparation/http";
export async function GET(request: Request) {
  return preparationResponse(null, async (actor) =>
    createPreparationService(await getDb()).metrics(
      actor,
      new URL(request.url).searchParams.get("date") || businessDate(new Date()),
    ),
  );
}
