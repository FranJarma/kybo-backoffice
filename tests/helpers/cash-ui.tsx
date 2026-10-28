import { createRoot } from "react-dom/client";
import { CashManager } from "../../src/components/cash/manager";
import { CashSettingsManager } from "../../src/components/cash/settings";
import { CashStatusGate } from "../../src/components/cash/status-gate";
const root = document.createElement("div");
root.style.cssText = "padding:20px;min-height:100vh;background:#f5f7fb";
document.body.appendChild(root);
const view = new URLSearchParams(location.search).get("view");
createRoot(root).render(
  view === "settings" ? (
    <CashSettingsManager branchId="branch" />
  ) : view === "status" ? (
    <CashStatusGate branchId="branch" />
  ) : (
    <CashManager branchId="branch" actorId="operator" />
  ),
);
