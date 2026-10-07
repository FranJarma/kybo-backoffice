import { CatalogManager } from "@/components/catalog-manager";
import { definitions } from "@/modules/catalog/definitions";
import type { Entity } from "@/modules/catalog/types";
import { requireCatalogPage } from "@/lib/page-access";
export async function CatalogPage({ entity }: { entity: Entity }) {
  await requireCatalogPage();
  return <CatalogManager entity={entity} definition={definitions[entity]} />;
}
