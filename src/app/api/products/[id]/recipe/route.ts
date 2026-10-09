import { eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { recipes } from "@/db/recipe-schema";
import { requireCatalogRead } from "@/modules/branches/context";
import { catalogResponse } from "@/modules/catalog/http";
import { createRecipeService } from "@/modules/recipes/service";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return catalogResponse(null, async (actor) => {
    const id = z.uuid().parse((await context.params).id);
    const db = await getDb();
    await requireCatalogRead(db, actor);
    const [recipe] = await db
      .select({ id: recipes.id })
      .from(recipes)
      .where(eq(recipes.productId, id));
    return {
      recipe: recipe
        ? await createRecipeService(db).get(actor, recipe.id)
        : null,
    };
  });
}
