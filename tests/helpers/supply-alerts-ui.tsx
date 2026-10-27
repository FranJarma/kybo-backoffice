import { createRoot } from "react-dom/client";
import { PurchasesWorkspace } from "../../src/components/inventory/purchases-workspace";
const root = document.createElement("div");
root.style.padding = "20px";
document.body.appendChild(root);
createRoot(root).render(
  <PurchasesWorkspace
    actorId="manager"
    timeZone="America/Argentina/Buenos_Aires"
  />,
);
