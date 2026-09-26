import { getDb } from "@/db/client";
import { inventoryResponse } from "@/modules/inventory/http";
import { createInventoryService } from "@/modules/inventory/service";

export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return inventoryResponse(request, async (actor, input) => ({
    receipt: await createInventoryService(await getDb()).pay(
      actor,
      (await context.params).id,
      input,
    ),
  }));
}
