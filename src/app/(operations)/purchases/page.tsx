import { requireActor } from "@/lib/auth";
import { PurchasesManager } from "@/components/inventory/purchases-manager";
export default async function PurchasesPage() {
  const actor = await requireActor();
  return <PurchasesManager actorId={actor.id} />;
}
