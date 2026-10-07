import { requirePageActor as requireActor } from "@/modules/branches/page-context";
import { PreparationBoard } from "@/components/preparation/board";
export default async function KitchenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireActor(),
    q = await searchParams;
  return (
    <PreparationBoard
      actorId={actor.id}
      role={actor.role}
      initialSale={typeof q.sale === "string" ? q.sale : undefined}
    />
  );
}
