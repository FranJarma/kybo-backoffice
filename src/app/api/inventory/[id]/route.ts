import { getDb } from "@/db/client";
import { inventoryResponse } from "@/modules/inventory/http";
import { createInventoryService } from "@/modules/inventory/service";

export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return inventoryResponse(null, async (actor) => {
    const { id } = await context.params;
    const query = new URL(request.url).searchParams;
    const service = createInventoryService(await getDb());
    const [lots, movements] = await Promise.all([
      service.getLots(actor, id, Number(query.get("lotOffset") ?? "0")),
      service.getMovements(
        actor,
        id,
        Number(query.get("movementOffset") ?? "0"),
      ),
    ]);
    return { lots, movements };
  });
}
