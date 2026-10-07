"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { LocationSelect } from "@/components/branches/location-select";
import { getJson, SearchSelect, useOperation, quantity } from "./shared";
import { decimal, integer, six } from "@/modules/inventory/decimal";
type Allocation = {
  id: string;
  itemName: string;
  quantity: string;
  received: string;
  resolved: string;
};
type Transfer = {
  id: string;
  originBranchId: string;
  destinationBranchId: string;
  originLocationId: string;
  destinationLocationId: string;
  reason: string;
  state: string;
  revision: number;
  allocations: Allocation[];
};
type Directory = {
  hasMore: boolean;
  branchId: string;
  destinations: { id: string; name: string; branchName: string }[];
  rows: Transfer[];
};
const labels: Record<string, string> = {
  confirmed: "Reservado",
  in_transit: "En tránsito",
  received: "Recibido",
  resolved: "Diferencia resuelta",
  cancelled: "Anulado",
};
export function TransfersManager({ actorId }: { actorId: string }) {
  const [offset, setOffset] = useState(0),
    [scope, setScope] = useState("active");
  const [data, setData] = useState<Directory>(),
    [version, setVersion] = useState(0),
    [error, setError] = useState("");
  const [origin, setOrigin] = useState(""),
    [destination, setDestination] = useState(""),
    [itemId, setItemId] = useState(""),
    [amount, setAmount] = useState(""),
    [reason, setReason] = useState("");
  const onSuccess = useCallback(() => {
    setVersion((v) => v + 1);
    setError("");
  }, []);
  const operation = useOperation<Record<string, unknown>>(
    actorId,
    "transfer",
    onSuccess,
  );
  useEffect(() => {
    let live = true;
    getJson<Directory>(`/api/transfers?scope=${scope}&offset=${offset}`)
      .then((result) => {
        if (live) setData(result);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [version, scope, offset]);
  function submit(event: FormEvent) {
    event.preventDefault();
    try {
      operation.submit("/api/transfers", {
        requestId: crypto.randomUUID(),
        originLocationId: origin,
        destinationLocationId: destination,
        reason,
        demands: [{ itemId, quantity: decimal(amount, 6, true, true) }],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revisá la cantidad.");
    }
  }
  return (
    <section className="space-y-6">
      <header>
        <p className="eyebrow">Inventario y compras</p>
        <h1 className="text-3xl font-extrabold text-brand">Traslados</h1>
        <p className="mt-2 text-muted">
          Reservá en origen, confirmá el despacho y registrá lo recibido en
          destino.
        </p>
      </header>
      {(error || operation.error) && (
        <p role="alert" className="text-red-700">
          {error || operation.error}
        </p>
      )}
      {operation.uncertain && (
        <Button onClick={operation.retry} disabled={operation.busy}>
          Reintentar el mismo envío
        </Button>
      )}
      <Card className="p-5">
        <form onSubmit={submit}>
          <fieldset
            disabled={operation.locked}
            className="grid gap-4 md:grid-cols-2"
          >
            <LocationSelect value={origin} onChange={setOrigin} />
            <label className="space-y-2 text-sm font-semibold">
              Destino
              <select
                required
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="block w-full rounded-lg border p-2"
              >
                <option value="">Elegí sucursal y ubicación</option>
                {data?.destinations
                  .filter((d) => d.id !== origin)
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.branchName} · {d.name}
                    </option>
                  ))}
              </select>
            </label>
            <SearchSelect
              entity="items"
              label="Artículo"
              value={itemId}
              onChange={setItemId}
              required
            />
            <label className="text-sm font-semibold">
              Cantidad en unidad base
              <Input
                required
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label className="text-sm font-semibold">
              Motivo
              <Input
                required
                maxLength={2000}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </label>
            <Button type="submit">Reservar traslado</Button>
          </fieldset>
        </form>
      </Card>
      <label>
        Ver traslados{" "}
        <select
          value={scope}
          onChange={(e) => {
            setScope(e.target.value);
            setOffset(0);
          }}
          className="rounded border p-2"
        >
          <option value="active">Pendientes</option>
          <option value="history">Historial</option>
        </select>
      </label>
      <div className="flex gap-3">
        <Button
          variant="outline"
          disabled={offset === 0}
          onClick={() => setOffset((v) => Math.max(0, v - 100))}
        >
          Anteriores
        </Button>
        <Button
          variant="outline"
          disabled={!data?.hasMore}
          onClick={() => setOffset((v) => v + 100)}
        >
          Siguientes
        </Button>
      </div>
      <div className="space-y-4">
        {data?.rows.map((row) => (
          <Card key={row.id} className="space-y-4 p-5">
            <div>
              <h2 className="font-bold">
                {data.destinations.find((d) => d.id === row.originLocationId)
                  ?.name ?? "Origen"}{" "}
                →{" "}
                {data.destinations.find(
                  (d) => d.id === row.destinationLocationId,
                )?.name ?? "Destino"}
              </h2>
              <p>
                {labels[row.state]} · {row.reason}
              </p>
            </div>
            {row.state === "confirmed" &&
              row.originBranchId === data.branchId && (
                <div className="flex gap-3">
                  <Button
                    disabled={operation.locked}
                    onClick={() =>
                      operation.submit(`/api/transfers/${row.id}/dispatch`, {
                        requestId: crypto.randomUUID(),
                        expectedRevision: row.revision,
                      })
                    }
                  >
                    Confirmar despacho
                  </Button>
                  <Button
                    variant="outline"
                    disabled={operation.locked}
                    onClick={() =>
                      operation.submit(`/api/transfers/${row.id}/cancel`, {
                        requestId: crypto.randomUUID(),
                        expectedRevision: row.revision,
                      })
                    }
                  >
                    Anular reserva
                  </Button>
                </div>
              )}
            {row.allocations.map((a) => (
              <AllocationForm
                key={`${a.id}:${row.revision}`}
                allocation={a}
                transfer={row}
                branchId={data.branchId}
                locked={operation.locked}
                submit={operation.submit}
              />
            ))}
          </Card>
        ))}
      </div>
    </section>
  );
}
function AllocationForm({
  allocation: a,
  transfer: t,
  branchId,
  locked,
  submit,
}: {
  allocation: Allocation;
  transfer: Transfer;
  branchId: string;
  locked: boolean;
  submit: (url: string, payload: Record<string, unknown>) => void;
}) {
  const remaining = six(
    integer(a.quantity) - integer(a.received) - integer(a.resolved),
  );
  const [amount, setAmount] = useState(""),
    [reason, setReason] = useState(""),
    [kind, setKind] = useState("loss"),
    [error, setError] = useState("");
  const receiving = t.destinationBranchId === branchId;
  function save(event: FormEvent) {
    event.preventDefault();
    try {
      const q = decimal(amount, 6, true, true)!;
      if (integer(q) > integer(remaining))
        throw new Error("La cantidad supera lo pendiente.");
      submit(`/api/transfers/${t.id}/${receiving ? "receive" : "resolve"}`, {
        requestId: crypto.randomUUID(),
        expectedRevision: t.revision,
        ...(receiving
          ? { lines: [{ allocationId: a.id, quantity: q }] }
          : { allocationId: a.id, quantity: q, reason, kind }),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Cantidad inválida.");
    }
  }
  return (
    <div className="border-t pt-3">
      <p className="text-sm font-semibold">
        {a.itemName} · enviado {quantity(a.quantity)} · recibido{" "}
        {quantity(a.received)} · pendiente {quantity(remaining)}
      </p>
      {t.state === "in_transit" && integer(remaining) > 0n && (
        <form onSubmit={save}>
          <fieldset
            disabled={locked}
            className="mt-3 flex flex-wrap items-end gap-3"
          >
            <label className="text-sm">
              Cantidad
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="decimal"
                required
              />
            </label>
            {!receiving && (
              <>
                <label className="text-sm">
                  Resolución
                  <select
                    className="block rounded border p-2"
                    value={kind}
                    onChange={(e) => setKind(e.target.value)}
                  >
                    <option value="loss">Pérdida en tránsito</option>
                    <option value="return">Regreso a origen</option>
                  </select>
                </label>
                <label className="text-sm">
                  Motivo
                  <Input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                    maxLength={2000}
                  />
                </label>
              </>
            )}
            <Button type="submit">
              {receiving ? "Registrar recepción" : "Resolver diferencia"}
            </Button>
          </fieldset>
          {error && (
            <p role="alert" className="text-red-700">
              {error}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
