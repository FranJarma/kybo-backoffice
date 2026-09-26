import { requireActor } from "@/lib/auth";
import { TablesManager } from "@/components/sales/tables-manager";
export default async function TablesPage() {
  const actor = await requireActor();
  return <TablesManager actorId={actor.id} role={actor.role} />;
}
