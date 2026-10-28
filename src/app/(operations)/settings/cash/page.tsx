import { redirect } from "next/navigation";
import { requirePageActor } from "@/modules/branches/page-context";
import { CashSettingsManager } from "@/components/cash/settings";

export default async function CashSettingsPage() {
  const actor = await requirePageActor();
  if (actor.role !== "admin") redirect("/sales");
  return (
    <CashSettingsManager key={actor.branchId} branchId={actor.branchId!} />
  );
}
