import { requirePageActor as requireActor } from "@/modules/branches/page-context";
import { ProductionOrdersPanel } from "@/components/production/orders-panel";
import { ProductionManager } from "@/components/production/production-manager";
export default async function ProductionPage({
  searchParams,
}: {
  searchParams: Promise<{ recipe?: string }>;
}) {
  const actor = await requireActor();
  if (actor.role === "staff")
    return (
      <ProductionOrdersPanel
        actorId={actor.id}
        recipe={null}
        timeZone={actor.timeZone!}
        canManage={false}
      />
    );
  const query = await searchParams;
  return (
    <ProductionManager
      actorId={actor.id}
      timeZone={actor.timeZone!}
      initialRecipe={typeof query.recipe === "string" ? query.recipe : ""}
    />
  );
}
