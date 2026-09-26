import { getDb } from "@/db/client";
import { inventoryResponse } from "@/modules/inventory/http";
import { createRecipeService } from "@/modules/recipes/service";
import type { RecipeKind } from "@/modules/recipes/types";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return inventoryResponse(null, async (actor) => {
    const q = new URL(request.url).searchParams;
    return createRecipeService(await getDb()).list(
      actor,
      (q.get("kind") || undefined) as RecipeKind | undefined,
      q.get("q") ?? "",
      Number(q.get("offset") ?? 0),
    );
  });
}
export async function POST(request: Request) {
  return inventoryResponse(request, async (actor, input) =>
    createRecipeService(await getDb()).save(actor, input),
  );
}
