import { getDb } from "@/db/client";
import { inventoryResponse } from "@/modules/inventory/http";
import { createInventoryService } from "@/modules/inventory/service";

export const runtime = "nodejs";
export async function GET(request: Request) {
  return inventoryResponse(null, async (actor) => {
    const search = new URL(request.url).searchParams.get("q") ?? "";
    return createInventoryService(await getDb()).getStock(actor, search);
  });
}
