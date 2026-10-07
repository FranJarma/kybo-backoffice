import { getDb } from "@/db/client";
import { catalogResponse as inventoryResponse } from "@/modules/catalog/http";
import { proposeConversion } from "@/modules/recipes/conversion";
import { recipeId } from "@/modules/recipes/service";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return inventoryResponse(null, async (actor) => {
    const { id } = await context.params;
    recipeId(id);
    return proposeConversion(
      await getDb(),
      actor,
      id,
      Number(new URL(request.url).searchParams.get("revision")),
    );
  });
}
