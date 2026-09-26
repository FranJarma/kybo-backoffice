import { getDb } from "@/db/client";
import { inventoryResponse } from "@/modules/inventory/http";
import { createProductionService } from "@/modules/production/service";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return inventoryResponse(request, async (actor, input) =>
    createProductionService(await getDb()).preview(actor, input),
  );
}
