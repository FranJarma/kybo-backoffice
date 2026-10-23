import { requireManagerPage } from "@/lib/page-access";
import { SupplyAlertManager } from "@/components/inventory/supply-alert-manager";
export default async function SupplyAlertsPage() {
  const actor = await requireManagerPage();
  return <SupplyAlertManager key={actor.branchId} actorId={actor.id} />;
}
