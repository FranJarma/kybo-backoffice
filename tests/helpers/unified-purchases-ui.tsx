import { createRoot } from "react-dom/client";
import { PurchasesWorkspace } from "../../src/components/inventory/purchases-workspace";
import { ItemPurchaseSettings } from "../../src/components/items/purchase-settings";
import { TaskDetail } from "../../src/components/daily-operations/task-detail";
import type { TaskRow } from "../../src/modules/daily-operations/types";
import { CatalogManager } from "../../src/components/catalog-manager";
import { definitions } from "../../src/modules/catalog/definitions";
const root = document.createElement("main");
root.style.padding = "20px";
document.body.append(root);
const mode = new URLSearchParams(location.search).get("mode");
const task = (window as unknown as { testTask: TaskRow }).testTask;
createRoot(root).render(
  mode === "catalog" ? (
    <CatalogManager
      entity="items"
      definition={definitions.items}
      actorId="manager"
      canManagePurchases={!new URLSearchParams(location.search).has("staff")}
    />
  ) : mode === "settings" ? (
    <ItemPurchaseSettings
      actorId="manager"
      itemId="33333333-3333-4333-8333-333333333333"
    />
  ) : mode === "task" ? (
    <TaskDetail
      task={task}
      people={[]}
      canManage
      disabled={false}
      onClose={() => {}}
      onRefresh={async () => task}
    />
  ) : (
    <PurchasesWorkspace
      actorId="manager"
      timeZone="America/Argentina/Buenos_Aires"
    />
  ),
);
