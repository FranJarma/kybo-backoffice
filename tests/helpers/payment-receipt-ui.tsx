import { createRoot } from "react-dom/client";
import { useState } from "react";
import {
  PaymentDialog,
  type PaymentDraft,
} from "../../src/components/sales/payment-dialog";

function Fixture() {
  const [payments, setPayments] = useState<PaymentDraft[] | null>(null);
  const [error, setError] = useState("");
  const params = new URLSearchParams(location.search);
  return (
    <>
      <PaymentDialog
        amount="100.00"
        delivery={params.has("delivery")}
        exact
        locked={false}
        busy={false}
        error={error}
        uncertain={false}
        onRetry={() => {}}
        onClose={() => {}}
        onConfirm={(rows) => {
          setPayments(rows);
          if (params.has("error"))
            setError("No se pudo registrar la venta. Volvé a intentar.");
        }}
        methods={[
          { id: "cash", name: "Efectivo", kind: "cash" },
          { id: "card", name: "Tarjeta débito", kind: "card" },
          { id: "card-2", name: "Tarjeta crédito", kind: "card" },
          { id: "transfer", name: "Transferencia", kind: "transfer" },
        ]}
        methodsError=""
        methodsLoading={false}
        onRefreshMethods={() => {}}
      />
      <pre data-payments-json>{JSON.stringify(payments)}</pre>
    </>
  );
}
const root = document.createElement("div");
document.body.appendChild(root);
createRoot(root).render(<Fixture />);
