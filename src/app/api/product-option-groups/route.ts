import { getDb } from "@/db/client";
import { catalogResponse } from "@/modules/catalog/http";
import { createProductGroupService } from "@/modules/combos/product-groups";
export const runtime = "nodejs";
export async function GET() {
  return catalogResponse(null, async (actor) =>
    createProductGroupService(await getDb()).list(actor),
  );
}
export async function POST(request: Request) {
  return catalogResponse(request, async (actor, input) =>
    createProductGroupService(await getDb()).save(actor, input),
  );
}
