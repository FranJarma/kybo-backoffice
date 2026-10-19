import { requireCatalogPage } from "@/lib/page-access";
import { ProductOptionGroupsManager } from "@/components/products/option-groups-manager";
export default async function Page() {
  await requireCatalogPage();
  return <ProductOptionGroupsManager />;
}
