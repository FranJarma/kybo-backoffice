import { requireManagerPage as requirePageActor } from "@/lib/page-access";
import { InternalUseManager } from "@/components/inventory/internal-use-manager";
export default async function InternalUsePage() {
  const actor = await requirePageActor();
  return <InternalUseManager actorId={actor.id} />;
}
