import { requireManagerPage as requirePageActor } from "@/lib/page-access";
import { TransfersManager } from "@/components/inventory/transfers-manager";
export default async function TransfersPage() {
  const actor = await requirePageActor();
  return <TransfersManager actorId={actor.id} />;
}
