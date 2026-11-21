import { useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { validSaleResult } from "@/components/sales/sale-result";
import { useOperation } from "@/components/inventory/shared";

function OperationFixture({
  scope,
  cash,
  onConfirmation,
}: {
  scope: string;
  cash: boolean;
  onConfirmation: () => void;
}) {
  const [confirmed, setConfirmed] = useState(0);
  const operation = useOperation(
    "cashier",
    cash ? "cash" : "sale",
    () => {
      setConfirmed((n) => n + 1);
      onConfirmation();
    },
    scope,
    cash ? undefined : validSaleResult,
  );
  const retained = useRef<{
    submit: () => void;
    retry: () => void;
    discard: () => void;
  } | null>(null);
  function submit() {
    if (cash) {
      operation.submit("/api/cash", {
        requestId: crypto.randomUUID(),
        command: { action: "close" },
      });
      return;
    }
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

function Harness() {
  const [instance, setInstance] = useState(0);
  const [scope, setScope] = useState("branch");
  const [cash, setCash] = useState(false);
  const [confirmed, setConfirmed] = useState<number[]>([]);
  return (
    <>
      <button onClick={() => setInstance((n) => n + 1)}>
        Reabrir terminal
      </button>
      <button onClick={() => setScope(scope === "branch" ? "other" : "branch")}>
        Cambiar sucursal
      </button>
      <button onClick={() => setCash(true)}>Probar cierre</button>
      <output data-testid="callbacks">{confirmed.join(",")}</output>
      <OperationFixture
        key={instance}
        scope={scope}
        cash={cash}
        onConfirmation={() => {
          const url = new URL(window.location.href);
          url.searchParams.set("confirmedBy", String(instance));
          window.history.replaceState(null, "", url);
          setConfirmed((previous) => [...previous, instance]);
        }}
      />
    </>
  );
}
createRoot(document.getElementById("fixture")!).render(<Harness />);
