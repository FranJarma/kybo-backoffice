import { getDb } from "@/db/client";
import { inventoryResponse } from "@/modules/inventory/http";
import { createRecipeService } from "@/modules/recipes/service";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return inventoryResponse(request, async (actor, input) =>
    createRecipeService(await getDb()).cost(
      actor,
      (await context.params).id,
      input,
    ),
  );
}
