import { requireManagerPage } from "@/lib/page-access";
import { redirect } from "next/navigation";
export default async function SupplyAlertsPage() {
  await requireManagerPage();
  redirect("/inventory/purchases");
}
