import { requireActor } from "@/lib/auth";
import { ProductionManager } from "@/components/production/production-manager";
export default async function ProductionPage({
  searchParams,
}: {
  searchParams: Promise<{ recipe?: string }>;
}) {
  const actor = await requireActor();
  const query = await searchParams;
  return (
    <ProductionManager
      actorId={actor.id}
      initialRecipe={typeof query.recipe === "string" ? query.recipe : ""}
    />
  );
}
