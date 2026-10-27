import { and, eq, isNull } from "drizzle-orm";
import type { Tx } from "@/db/types";
import { locations } from "@/db/branch-schema";
import { recipes, recipeVersions } from "@/db/recipe-schema";

export async function centralPreparationLocation(tx: Tx, branchId: string) {
  const [depot] = await tx
    .select({ id: locations.id, name: locations.name })
    .from(locations)
    .where(
      and(
        eq(locations.branchId, branchId),
        eq(locations.code, "DEPOSITO"),
        isNull(locations.archivedAt),
      ),
    );
  return depot ?? null;
}

export async function currentPreparationRecipes(tx: Tx) {
  return tx
    .select({
      itemId: recipes.outputItemId,
      versionId: recipeVersions.id,
      yieldQuantity: recipeVersions.yieldQuantity,
    })
    .from(recipes)
    .innerJoin(
      recipeVersions,
      and(
        eq(recipeVersions.recipeId, recipes.id),
        eq(recipeVersions.version, recipes.revision),
      ),
    )
    .where(eq(recipes.kind, "preparation"));
}
