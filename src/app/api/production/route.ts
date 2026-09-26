import { getDb } from "@/db/client";
import { inventoryResponse } from "@/modules/inventory/http";
import { createProductionService } from "@/modules/production/service";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return inventoryResponse(null, async (actor) =>
    createProductionService(await getDb()).list(
      actor,
      Number(new URL(request.url).searchParams.get("offset") ?? 0),
    ),
  );
}
export async function POST(request: Request) {
  return inventoryResponse(request, async (actor, input) =>
    createProductionService(await getDb()).record(actor, input),
  );
}
