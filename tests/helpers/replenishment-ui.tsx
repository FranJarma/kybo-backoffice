import { createRoot } from "react-dom/client";
import { ReplenishmentManager } from "../../src/components/inventory/replenishment-manager";
import { ReplenishmentPanel } from "../../src/components/sales/replenishment-panel";
const params = new URLSearchParams(window.location.search);
const root = document.createElement("div");
root.style.cssText = "padding:24px;max-width:1280px;margin:auto";
document.body.appendChild(root);
createRoot(root).render(
  params.get("view") === "alerts" ? (
    <ReplenishmentPanel
      actorId="minimum-ui"
      role={params.get("role") === "staff" ? "staff" : "manager"}
      refresh={0}
    />
  ) : (
    <ReplenishmentManager actorId="minimum-ui" />
  ),
);
