import { getDb } from "@/db/client";
import { inventoryResponse } from "@/modules/inventory/http";
import { createInventoryService } from "@/modules/inventory/service";

export const runtime = "nodejs";
export async function POST(request: Request) {
  return inventoryResponse(request, async (actor, input) =>
    createInventoryService(await getDb()).adjust(actor, input),
  );
}
