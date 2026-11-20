import { redirect } from "next/navigation";
import { requirePageActor } from "@/modules/branches/page-context";
import { PrintingSettings } from "@/components/printing/printing-settings";
export default async function PrintingSettingsPage() {
  const actor = await requirePageActor();
  if (actor.role !== "admin" || actor.accountKind === "store")
    redirect("/sales");
  return (
    <PrintingSettings
      key={`${actor.id}:${actor.branchId}`}
      branchId={actor.branchId!}
      actorId={actor.id}
    />
  );
}
