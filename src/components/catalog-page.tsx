import { CatalogManager } from "@/components/catalog-manager";
import { definitions } from "@/modules/catalog/definitions";
import type { Entity } from "@/modules/catalog/types";
import { requireCatalogPage } from "@/lib/page-access";
export async function CatalogPage({
  entity,
  ingredientsOnly = false,
}: {
  entity: Entity;
  ingredientsOnly?: boolean;
}) {
  const actor = await requireCatalogPage();
  return (
    <CatalogManager
      entity={entity}
      actorId={actor.id}
      ingredientsOnly={ingredientsOnly}
      definition={
        ingredientsOnly
          ? {
              ...definitions.items,
              title: "Ingredientes",
              singular: "ingrediente",
              description:
                "Alimentos y bebidas que usás en recetas, con sus unidades y costos. Los descartables se gestionan en el catálogo de inventario.",
              fields: definitions.items.fields
                .filter((field) => field.key !== "recipeUsable")
                .map((field) =>
                  field.key === "class"
                    ? {
                        ...field,
                        options: field.options?.filter((option) =>
                          ["food", "beverage"].includes(option.value),
                        ),
                      }
                    : field,
                ),
            }
          : definitions[entity]
      }
    />
  );
}
