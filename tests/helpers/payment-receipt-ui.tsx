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
  const [attempts, setAttempts] = useState(0);
  const [retries, setRetries] = useState(0);
  const [uncertain, setUncertain] = useState(false);
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
          locked={uncertain}
          busy={false}
          error={error}
          eventKey={attempts}
          uncertain={uncertain}
          canDiscard={uncertain}
          onRetry={() => setRetries((count) => count + 1)}
          onDiscard={() => {
            setUncertain(false);
            setError("");
          }}
          onClose={() => setOpen(false)}
          onConfirm={(rows, ...summary) => {
            setPayments(rows);
            setCash(summary[0] ?? null);
            setAttempts((count) => count + 1);
            if (params.has("uncertain")) setUncertain(true);
            if (params.has("error") || params.has("uncertain"))
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
      <output hidden data-attempts>
        {attempts}
      </output>
      <output hidden data-retries>
        {retries}
      </output>
      <pre hidden data-cash-json>
        {JSON.stringify(cash)}
      </pre>
    </>
  );
}

const root = document.createElement("div");
document.body.appendChild(root);
createRoot(root).render(<Fixture />);
