import { createRoot } from "react-dom/client";
import { TransfersManager } from "../../src/components/inventory/transfers-manager";
const root = document.createElement("div");
root.style.cssText = "padding:24px;max-width:1280px;margin:auto";
document.body.appendChild(root);
createRoot(root).render(<TransfersManager actorId="transfer-ui-manager" />);
