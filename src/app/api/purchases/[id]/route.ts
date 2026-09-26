import { getDb } from "@/db/client";
import { inventoryResponse } from "@/modules/inventory/http";
import { createInventoryService } from "@/modules/inventory/service";

export const runtime = "nodejs";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return inventoryResponse(null, async (actor) => ({
    receipt: await createInventoryService(await getDb()).getReceipt(
      actor,
      (await context.params).id,
    ),
  }));
}
