import { requirePageActor } from "@/modules/branches/page-context";
import { DailyOperationsManager } from "@/components/daily-operations/manager";
export default async function DailyOperationsPage() {
  const actor = await requirePageActor();
  return (
    <DailyOperationsManager
      key={actor.branchId}
      actorId={actor.id}
      role={actor.role}
    />
  );
}
