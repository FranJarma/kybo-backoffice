import { createRoot } from "react-dom/client";
import { DailyOperationsManager } from "../../src/components/daily-operations/manager";
const root = document.createElement("div");
root.style.padding = "20px";
document.body.appendChild(root);
createRoot(root).render(
  <DailyOperationsManager actorId="manager" role="manager" />,
);
