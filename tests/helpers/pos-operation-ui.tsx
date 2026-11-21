import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { validSaleResult } from "@/components/sales/sale-result";
import { useOperation } from "@/components/inventory/shared";

function OperationFixture() {
  const [confirmed, setConfirmed] = useState(0);
  const operation = useOperation(
    "cashier",
    "sale",
    () => setConfirmed((n) => n + 1),
    "branch",
    validSaleResult,
  );
  const retained = useRef<{
    submit: () => void;
    retry: () => void;
    discard: () => void;
  } | null>(null);
  function submit() {
    operation.submit("/api/sales", {
      requestId: crypto.randomUUID(),
      notes: "sin azúcar",
      payments: [{ collector: "local", amount: "150.00" }],
    });
  }
  return (
    <>
      <button
        onClick={() => {
          retained.current = {
            submit,
            retry: operation.retry,
            discard: operation.discardRejected,
          };
        }}
      >
        Guardar acciones
      </button>
      <button onClick={() => retained.current?.submit()}>
        Enviar anterior
      </button>
      <button onClick={() => retained.current?.retry()}>
        Reintentar anterior
      </button>
      <button onClick={() => retained.current?.discard()}>
        Descartar anterior
      </button>
      <button disabled={!operation.ready} onClick={submit}>
        Enviar
      </button>
      <button
        disabled={!operation.ready}
        onClick={() => {
          submit();
          submit();
        }}
      >
        Doble envío
      </button>
      <button onClick={operation.retry}>Reintentar</button>
      <button
        onClick={() => {
          operation.retry();
          operation.retry();
        }}
      >
        Doble reintento
      </button>
      <button
        onClick={() => {
          operation.retry();
          operation.discardRejected();
        }}
      >
        Reintentar y descartar
      </button>
      <output data-testid="state">
        {operation.busy
          ? "enviando"
          : operation.uncertain
            ? "incierto"
            : "edición"}
      </output>
      <output data-testid="confirmed">{confirmed}</output>
      <output data-testid="discard">{String(operation.canDiscard)}</output>
      <p>{operation.error}</p>
    </>
  );
}

createRoot(document.getElementById("fixture")!).render(<OperationFixture />);
