import { requireCatalogPage } from "@/lib/page-access";
import { ModifiersManager } from "@/components/modifiers/manager";
export default async function Page() {
  await requireCatalogPage();
  return <ModifiersManager />;
}
