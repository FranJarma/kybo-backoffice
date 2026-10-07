import { requireManagerPage as requireActor } from "@/lib/page-access";
import { InventoryManager } from "@/components/inventory/inventory-manager";
import { InventoryExceptions } from "@/components/inventory/exceptions";
export default async function InventoryPage() {
  const actor = await requireActor();
  return (
    <>
      <InventoryManager actorId={actor.id} timeZone={actor.timeZone!} />
      <InventoryExceptions actorId={actor.id} admin={actor.role === "admin"} />
    </>
  );
}
