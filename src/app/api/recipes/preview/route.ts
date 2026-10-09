import { getDb } from "@/db/client";
import { catalogResponse } from "@/modules/catalog/http";
import { previewRecipeCost } from "@/modules/recipes/preview";
export const runtime = "nodejs";
export async function POST(request: Request) {
  return catalogResponse(request, async (actor, input) =>
    previewRecipeCost(await getDb(), actor, input),
  );
}
