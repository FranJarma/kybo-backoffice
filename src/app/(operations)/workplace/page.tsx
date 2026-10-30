import { redirect } from "next/navigation";
import { requirePageActor } from "@/modules/branches/page-context";
import { WorkplaceManager } from "@/components/workplace/manager";
export default async function WorkplacePage() {
  const actor = await requirePageActor();
  if (actor.accountKind !== "store") redirect("/sales");
  return (
    <div className="mx-auto max-w-4xl rounded-2xl border border-line bg-white p-6 sm:p-8">
      <WorkplaceManager branchId={actor.branchId!} />
    </div>
  );
}
