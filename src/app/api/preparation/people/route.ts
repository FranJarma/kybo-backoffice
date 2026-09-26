import { getDb } from "@/db/client";
import { createPreparationService } from "@/modules/preparation/service";
import { preparationResponse } from "@/modules/preparation/http";
export async function GET() {
  return preparationResponse(null, async (actor) =>
    createPreparationService(await getDb()).people(actor),
  );
}
