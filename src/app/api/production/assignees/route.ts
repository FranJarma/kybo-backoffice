import { getDb } from "@/db/client";
import { productionResponse } from "@/modules/production/http";
import { productionAssignees } from "@/modules/production/queries";
export async function GET(request: Request) {
  return productionResponse(request, async (actor) =>
    productionAssignees(await getDb(), actor),
  );
}
