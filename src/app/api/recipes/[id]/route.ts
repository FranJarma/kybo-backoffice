import { getDb } from "@/db/client";
import { inventoryResponse } from "@/modules/inventory/http";
import { createRecipeService } from "@/modules/recipes/service";
export const runtime = "nodejs";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return inventoryResponse(null, async (actor) =>
    createRecipeService(await getDb()).get(
      actor,
      (await context.params).id,
      new URL(request.url).searchParams.get("version") || undefined,
    ),
  );
}
