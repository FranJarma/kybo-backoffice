import { createRoot } from "react-dom/client";
import { useState } from "react";
import {
  PaymentDialog,
  type PaymentDraft,
} from "../../src/components/sales/payment-dialog";

const params = new URLSearchParams(location.search);
const methods = [
  { id: "cash", name: "Efectivo", kind: "cash" },
  { id: "card", name: "Tarjeta débito", kind: "card" },
  { id: "card-2", name: "Tarjeta crédito", kind: "card" },
  { id: "transfer", name: "Transferencia", kind: "transfer" },
];

function Fixture() {
  const [open, setOpen] = useState(true);
  const [payments, setPayments] = useState<PaymentDraft[] | null>(null);
  const [cash, setCash] = useState<unknown>(null);
  const [error, setError] = useState("");
  return (
    <>
      <button hidden={open} onClick={() => setOpen(true)}>
        Abrir cobro
      </button>
      {open && (
        <PaymentDialog
          amount={params.has("example") ? "18900.00" : "100.00"}
          delivery={params.has("delivery")}
          exact={!params.has("partial")}
          locked={false}
          busy={false}
          error={error}
          uncertain={false}
          onRetry={() => {}}
          onClose={() => setOpen(false)}
          onConfirm={(rows, ...summary) => {
            setPayments(rows);
            setCash(summary[0] ?? null);
            if (params.has("error"))
              setError("No se pudo registrar la venta. Volvé a intentar.");
          }}
          methods={methods}
          methodsError=""
          methodsLoading={false}
          onRefreshMethods={() => {}}
        />
      )}
      <pre hidden data-payments-json>
        {JSON.stringify(payments)}
      </pre>
      <pre hidden data-cash-json>
        {JSON.stringify(cash)}
      </pre>
    </>
  );
}

const root = document.createElement("div");
document.body.appendChild(root);
createRoot(root).render(<Fixture />);
