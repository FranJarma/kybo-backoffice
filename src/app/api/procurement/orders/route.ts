import { getDb } from "@/db/client";
import { inventoryResponse } from "@/modules/inventory/http";
import { getOrderSnapshot } from "@/modules/procurement/queries";
import { createPurchaseDraft } from "@/modules/procurement/orders";
export const runtime = "nodejs";
export async function GET(request: Request) {
  void request;
  return inventoryResponse(null, async (actor) =>
    getOrderSnapshot(await getDb(), actor),
  );
}
export async function POST(request: Request) {
  return inventoryResponse(request, async (actor, input) =>
    createPurchaseDraft(await getDb(), actor, input),
  );
}
