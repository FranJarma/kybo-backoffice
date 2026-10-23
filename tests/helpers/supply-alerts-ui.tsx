import { createRoot } from "react-dom/client";
import { SupplyAlertManager } from "../../src/components/inventory/supply-alert-manager";
const root = document.createElement("div");
root.style.padding = "20px";
document.body.appendChild(root);
createRoot(root).render(<SupplyAlertManager actorId="manager" />);
