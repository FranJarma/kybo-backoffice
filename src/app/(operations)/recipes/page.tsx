import { requireActor } from "@/lib/auth";
import { RecipesManager } from "@/components/recipes/recipes-manager";
export default async function RecipesPage() {
  const actor = await requireActor();
  return <RecipesManager actorId={actor.id} />;
}
