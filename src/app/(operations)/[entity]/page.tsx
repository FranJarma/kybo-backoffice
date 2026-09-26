import { notFound } from "next/navigation";
import { CatalogManager } from "@/components/catalog-manager";
import { definitions } from "@/modules/catalog/definitions";
import { entities } from "@/modules/catalog/types";
import type { Entity } from "@/modules/catalog/types";
export default async function EntityPage({
  params,
}: {
  params: Promise<{ entity: string }>;
}) {
  const { entity } = await params;
  if (!entities.includes(entity as Entity)) notFound();
  return (
    <CatalogManager
      entity={entity as Entity}
      definition={definitions[entity as Entity]}
    />
  );
}
