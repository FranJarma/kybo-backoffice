import { requireActor } from "@/lib/auth";
import { InventoryManager } from "@/components/inventory/inventory-manager";
export default async function InventoryPage() {
  const actor = await requireActor();
  return <InventoryManager actorId={actor.id} />;
}
