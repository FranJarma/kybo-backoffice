import { createRoot } from "react-dom/client";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import { AppShell } from "../../src/components/app-shell";
import { SalesManager } from "../../src/components/sales/sales-manager";

const branchId = "10000000-0000-4000-8000-000000000001";
const actorId = "surface-cashier";
const router = {
  bfcacheId: "fixture",
  back() {
    history.back();
  },
  forward() {
    history.forward();
  },
  refresh() {
    location.reload();
  },
  push(url: string) {
    history.pushState(null, "", url);
  },
  replace(url: string) {
    history.replaceState(null, "", url);
  },
  prefetch() {},
};
createRoot(document.getElementById("fixture")!).render(
  <AppRouterContext.Provider value={router}>
    <PathnameContext.Provider value={location.pathname}>
      <AppShell
        actorId={actorId}
        role="admin"
        name="Una operadora"
        dateLabel="Hoy"
        branches={[{ id: branchId, name: "Sucursal" }]}
        selectedBranchId={branchId}
      >
        <SalesManager
          actorId={actorId}
          branchId={branchId}
          role="admin"
          initialAccount={
            new URLSearchParams(location.search).get("account") ?? undefined
          }
        />
      </AppShell>
    </PathnameContext.Provider>
  </AppRouterContext.Provider>,
);
