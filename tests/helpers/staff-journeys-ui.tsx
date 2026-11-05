import { createRoot } from "react-dom/client";
import { PreparationBoard } from "../../src/components/preparation/board";
import { PersonalWork } from "../../src/components/staff-work/personal";
import { CashStatusGate } from "../../src/components/cash/status-gate";
import { OperationNotice } from "../../src/components/sales/shared";
import { Input } from "../../src/components/ui/input";
import { ProductionOrdersPanel } from "../../src/components/production/orders-panel";
import { SalesManager } from "../../src/components/sales/sales-manager";

const view = new URLSearchParams(location.search).get("view");
createRoot(document.getElementById("root")!).render(
  view === "production-desktop" ? (
    <main className="mx-auto max-w-6xl p-4">
      <ProductionOrdersPanel
        actorId="manager"
        recipe={null}
        timeZone="America/Argentina/Buenos_Aires"
        canManage
        fixedScope="active"
      />
    </main>
  ) : view === "pos" ? (
    <main className="h-dvh bg-surface p-4" style={{ paddingTop: 88 }}>
      <SalesManager actorId="employee" branchId="branch" role="staff" />
    </main>
  ) : view === "production" || view === "production-tabs" ? (
    <PersonalWork
      branchId="branch"
      actorId="employee"
      initialTab="production"
      showTabControls={view === "production-tabs"}
    />
  ) : view === "opening" ? (
    <main className="space-y-4 p-4">
      <Input aria-label="Pedido en curso" />
      <CashStatusGate branchId="branch" actorId="employee" />
    </main>
  ) : view === "error" ? (
    <OperationNotice
      persistentError
      error="El medio de pago cambió. Volvé a seleccionarlo."
      uncertain={false}
      busy={false}
      retry={() => {}}
    />
  ) : (
    <PreparationBoard actorId="employee" role="staff" />
  ),
);
