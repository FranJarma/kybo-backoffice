import { getDb } from "@/db/client";
import { catalogResponse as inventoryResponse } from "@/modules/catalog/http";
import { createModifierService } from "@/modules/modifiers/service";
export const runtime = "nodejs";
export async function GET() {
  return inventoryResponse(null, async (actor) =>
    createModifierService(await getDb()).list(actor),
  );
}
export async function POST(request: Request) {
  return inventoryResponse(request, async (actor, input) =>
    createModifierService(await getDb()).save(actor, input),
  );
}
