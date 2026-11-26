import { Profiler } from "react";
import { createRoot } from "react-dom/client";
import { SalesManager } from "../../src/components/sales/sales-manager";

declare global {
  interface Window {
    posProfile: {
      commits: number;
      actualDurationMs: number;
      phases: Record<string, number>;
    };
  }
}
window.posProfile = { commits: 0, actualDurationMs: 0, phases: {} };
document.cookie = "kybo-branch=10000000-0000-4000-8000-000000000001; path=/";
const root = document.getElementById("fixture")!;
createRoot(root).render(
  <Profiler
    id="pos"
    onRender={(_id, phase, actualDuration) => {
      window.posProfile.commits++;
      window.posProfile.actualDurationMs += actualDuration;
      window.posProfile.phases[phase] =
        (window.posProfile.phases[phase] ?? 0) + 1;
    }}
  >
    <SalesManager
      actorId="surface-cashier"
      branchId="10000000-0000-4000-8000-000000000001"
      role="admin"
    />
  </Profiler>,
);
