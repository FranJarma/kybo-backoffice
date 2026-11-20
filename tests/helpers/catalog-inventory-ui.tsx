import { createRoot } from "react-dom/client";
import { CatalogManager } from "../../src/components/catalog-manager";
import { InventoryManager } from "../../src/components/inventory/inventory-manager";
import { definitions } from "../../src/modules/catalog/definitions";
const root = document.createElement("main");
root.className = "p-4 sm:p-6";
document.body.append(root);
const mode = new URLSearchParams(location.search).get("mode");
createRoot(root).render(
  mode === "inventory" ? (
    <InventoryManager
      actorId="manager"
      timeZone="America/Argentina/Buenos_Aires"
    />
  ) : (
    <CatalogManager
      entity={mode === "products" ? "products" : "items"}
      definition={
        mode === "products" ? definitions.products : definitions.items
      }
      actorId="manager"
      canManagePurchases
    />
  ),
);
