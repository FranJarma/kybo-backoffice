// Browser component fixture bundled by pickup-pos.spec.ts; never an app route.
import { OperationNotice } from "../../src/components/sales/shared";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../../src/components/ui/dialog";
import { Input } from "../../src/components/ui/input";
import { createRoot } from "react-dom/client";
import { SalesManager } from "../../src/components/sales/sales-manager";
import { FormFeedback } from "../../src/components/ui/form-feedback";
document.querySelector("main")?.setAttribute("hidden", "");
const container = document.createElement("div");
container.style.cssText = "padding:20px; min-height:100vh";
document.body.appendChild(container);
createRoot(container).render(
  location.hash === "#stock-error" ? (
    <Dialog defaultOpen>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Registrar cobro</DialogTitle>
          <DialogDescription>Elegí cómo paga el cliente.</DialogDescription>
        </DialogHeader>
        <Input aria-label="Efectivo recibido" defaultValue="5000" />
        <OperationNotice
          error={
            "No hay stock disponible suficiente para reservar:\n• Leche en Barra: faltan 204,081633 ml (necesarios: 204,081633; disponibles: 0).\n• Preparado de té chai en Barra: faltan 153,061225 ml (necesarios: 153,061225; disponibles: 0).\nReponé los insumos en las ubicaciones indicadas y volvé a intentar."
          }
          uncertain={false}
          busy={false}
          retry={() => {}}
        />
      </DialogContent>
    </Dialog>
  ) : (
    <>
      <SalesManager
        actorId="fixture"
        branchId="11111111-1111-4111-8111-111111111111"
        role="admin"
        initialAccount={
          location.hash === "#detail"
            ? "22222222-2222-4222-8222-222222222222"
            : undefined
        }
      />
      <FormFeedback />
    </>
  ),
);
