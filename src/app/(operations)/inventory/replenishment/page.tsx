import { requireManagerPage } from "@/lib/page-access";
import { ReplenishmentManager } from "@/components/inventory/replenishment-manager";
export default async function ReplenishmentPage() {
  const actor = await requireManagerPage();
  return <ReplenishmentManager actorId={actor.id} />;
}
