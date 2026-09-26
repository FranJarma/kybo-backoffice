import { getDb } from "@/db/client";
import { inventoryResponse } from "@/modules/inventory/http";
import { createProductionService } from "@/modules/production/service";
export const runtime = "nodejs";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return inventoryResponse(null, async (actor) =>
    createProductionService(await getDb()).get(
      actor,
      (await context.params).id,
    ),
  );
}
