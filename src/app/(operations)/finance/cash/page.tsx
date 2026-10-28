import { requirePageActor } from "@/modules/branches/page-context";
import { CashManager } from "@/components/cash/manager";

export default async function CashPage() {
  const actor = await requirePageActor();
  return (
    <CashManager
      key={`${actor.id}:${actor.branchId}`}
      branchId={actor.branchId!}
      actorId={actor.id}
    />
  );
}
