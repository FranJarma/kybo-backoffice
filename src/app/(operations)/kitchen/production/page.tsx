import { requireManagerPage as requireActor } from "@/lib/page-access";
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
      timeZone={actor.timeZone!}
      initialRecipe={typeof query.recipe === "string" ? query.recipe : ""}
    />
  );
}
