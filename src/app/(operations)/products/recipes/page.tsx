import { requireCatalogPage as requireActor } from "@/lib/page-access";
import { RecipesManager } from "@/components/recipes/recipes-manager";
export default async function RecipesPage() {
  const actor = await requireActor();
  return <RecipesManager actorId={actor.id} />;
}
