"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { ArrowRight, ArrowLeft, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { FieldCaption } from "@/components/ui/field-caption";
import { OperationAlert } from "@/components/ui/operation-alert";
import { useErrorFeedback } from "@/components/ui/use-error-feedback";
import { getJson, useOperation } from "./shared";
import { TransferDraftForm } from "./transfer-draft-form";
import { integer, six } from "@/modules/inventory/decimal";
import {
  transferEntryUnit,
  parseTransferQuantity,
  formatTransferQuantity,
} from "@/modules/transfers/quantities";
import type {
  TransferAllocation as Allocation,
  TransferRecord as Transfer,
  TransferDirectory as Directory,
} from "@/modules/transfers/types";
const labels: Record<string, string> = {
  confirmed: "Reservado",
  in_transit: "En tránsito",
  received: "Recibido",
  resolved: "Diferencia resuelta",
  cancelled: "Anulado",
};
const fieldClass =
  "grid min-w-0 content-start gap-2 text-sm font-semibold text-brand";
const selectClass =
  "min-h-12 w-full rounded-lg border bg-white px-3 text-sm font-normal";
export function TransfersManager({ actorId }: { actorId: string }) {
  const [offset, setOffset] = useState(0),
    [scope, setScope] = useState("active");
  const [data, setData] = useState<Directory>(),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  const [error, setError, errorAttempt] = useErrorFeedback();
  const onSuccess = useCallback(() => {
    setLoading(true);
    setVersion((value) => value + 1);
    setError("");
  }, [setError]);
  const operation = useOperation<Record<string, unknown>>(
    actorId,
    "transfer",
    onSuccess,
  );
  useEffect(() => {
    let live = true;
    getJson<Directory>(`/api/transfers?scope=${scope}&offset=${offset}`)
      .then((result) => {
        if (live) {
          setData(result);
          setLoading(false);
          setError("");
        }
      })
      .catch((failure) => {
        if (live) {
          setLoading(false);
          setError(failure.message);
        }
      });
    return () => {
      live = false;
    };
  }, [version, scope, offset, setError]);
  return (
    <section data-transfers className="space-y-7 text-brand">
      <header>
        <p className="eyebrow">Inventario y compras</p>
        <h1 className="text-3xl font-extrabold">Traslados</h1>
        <p className="mt-2 max-w-3xl text-muted">
          Agregá los insumos a la lista, revisá el destino de cada uno y
          confirmá todo de una sola vez.
        </p>
      </header>
      <OperationAlert
        title="No pudimos completar el traslado"
        message={error || operation.error}
        eventKey={error ? errorAttempt : operation.errorAttempt}
        tone="error"
      />
      {operation.uncertain && (
        <Button onClick={operation.retry} disabled={operation.busy}>
          Reintentar el mismo envío
        </Button>
      )}
      <TransferDraftForm
        actorId={actorId}
        directory={data}
        blocked={operation.locked}
        onSuccess={onSuccess}
      />
      <section className="space-y-4" aria-label="Seguimiento de traslados">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Seguimiento de traslados</h2>
            <p className="mt-1 text-sm text-muted">
              {scope === "active"
                ? "Reservas por completar y envíos que todavía no llegaron."
                : "Traslados recibidos, diferencias resueltas y reservas anuladas."}
            </p>
          </div>
          <label className="grid gap-2 text-sm font-medium">
            Mostrar
            <select
              aria-label="Ver traslados"
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                setOffset(0);
                setLoading(true);
              }}
              className={selectClass}
            >
              <option value="active">Pendientes</option>
              <option value="history">Finalizados y anulados</option>
            </select>
          </label>
        </div>
        {loading || !data || error ? (
          <p
            role="status"
            className="rounded-xl border bg-white p-6 text-sm text-muted"
          >
            {error
              ? "No pudimos consultar los traslados."
              : "Cargando traslados…"}
          </p>
        ) : !data.rows.length ? (
          <div className="rounded-xl border border-dashed bg-white p-7 text-center">
            <Truck
              className="mx-auto mb-3 size-7 text-muted"
              aria-hidden="true"
            />
            <h3 className="font-semibold">
              {scope === "active"
                ? "No hay traslados pendientes"
                : "Todavía no hay traslados finalizados"}
            </h3>
            <p className="mt-2 text-sm text-muted">
              {scope === "active"
                ? "Los envíos en tránsito y las reservas pendientes aparecen acá. Los traslados internos confirmados están en «Finalizados y anulados»."
                : "Acá vas a encontrar los traslados completados y las reservas anuladas."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {data.rows.map((row) => {
              const from = data.destinations.find(
                  (d) => d.id === row.originLocationId,
                ),
                to = data.destinations.find(
                  (d) => d.id === row.destinationLocationId,
                ),
                internal = row.originBranchId === row.destinationBranchId;
              return (
                <Card key={row.id} className="gap-4 p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h3 className="flex flex-wrap items-center gap-2 font-bold">
                        <span>{from?.name ?? "Origen"}</span>
                        <ArrowRight
                          className="size-4 text-muted"
                          aria-hidden="true"
                        />
                        <span>{to?.name ?? "Destino"}</span>
                      </h3>
                      {!internal && (
                        <p className="mt-1 text-xs text-muted">
                          {from?.branchName} → {to?.branchName}
                        </p>
                      )}
                      <p className="mt-2 break-words text-sm text-muted">
                        {row.reason}
                      </p>
                    </div>
                    <span className="rounded-md bg-secondary px-3 py-1.5 text-xs font-semibold text-brand">
                      {labels[row.state]}
                    </span>
                  </div>
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
                  {row.state === "confirmed" &&
                    row.originBranchId === data.branchId && (
                      <div className="space-y-3 border-t pt-4">
                        <p className="text-sm text-muted">
                          {internal
                            ? `Confirmá cuando los insumos estén en ${to?.name ?? "destino"}. El stock se actualiza en las dos ubicaciones.`
                            : "Confirmá el despacho cuando los insumos salgan de origen. En destino deberán registrar la recepción."}
                        </p>
                        <div className="flex flex-wrap gap-3">
                          <Button
                            className="min-h-12"
                            disabled={operation.locked}
                            onClick={() =>
                              operation.submit(
                                `/api/transfers/${row.id}/dispatch`,
                                {
                                  requestId: crypto.randomUUID(),
                                  expectedRevision: row.revision,
                                },
                              )
                            }
                          >
                            {internal
                              ? "Confirmar traslado realizado"
                              : "Confirmar despacho"}
                          </Button>
                          <Button
                            variant="outline"
                            className="min-h-12"
                            disabled={operation.locked}
                            onClick={() =>
                              operation.submit(
                                `/api/transfers/${row.id}/cancel`,
                                {
                                  requestId: crypto.randomUUID(),
                                  expectedRevision: row.revision,
                                },
                              )
                            }
                          >
                            Anular reserva
                          </Button>
                        </div>
                      </div>
                    )}
                </Card>
              );
            })}
          </div>
        )}
        {data && (offset > 0 || data.hasMore) && (
          <nav
            aria-label="Páginas de traslados"
            className="flex flex-wrap items-center justify-between gap-3 border-t pt-4"
          >
            <p className="text-sm text-muted">Página {offset / 100 + 1}</p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                className="min-h-12 gap-2"
                disabled={offset === 0 || loading}
                onClick={() => {
                  setOffset((v) => Math.max(0, v - 100));
                  setLoading(true);
                }}
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
                Página anterior
              </Button>
              <Button
                variant="outline"
                className="min-h-12 gap-2"
                disabled={!data.hasMore || loading}
                onClick={() => {
                  setOffset((v) => v + 100);
                  setLoading(true);
                }}
              >
                Página siguiente
                <ArrowRight className="size-4" aria-hidden="true" />
              </Button>
            </div>
          </nav>
        )}
      </section>
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
    [error, setError, errorAttempt] = useErrorFeedback();
  const receiving = t.destinationBranchId === branchId,
    unit = transferEntryUnit(a.baseUnit);
  function save(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const q = parseTransferQuantity(amount, a.baseUnit);
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
    <div className="space-y-3 border-t pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="font-semibold">{a.itemName}</h4>
        <span className="font-bold tabular-nums">
          {formatTransferQuantity(a.quantity, a.baseUnit)}
        </span>
      </div>
      {(t.state === "in_transit" ||
        t.state === "received" ||
        t.state === "resolved") && (
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-muted">Recibido</dt>
            <dd className="mt-1 font-medium">
              {formatTransferQuantity(a.received, a.baseUnit)}
            </dd>
          </div>
          {integer(a.resolved) > 0n && (
            <div>
              <dt className="text-muted">Diferencia resuelta</dt>
              <dd className="mt-1 font-medium">
                {formatTransferQuantity(a.resolved, a.baseUnit)}
              </dd>
            </div>
          )}
          {t.state === "in_transit" && (
            <div>
              <dt className="text-muted">Pendiente de recibir o resolver</dt>
              <dd className="mt-1 font-medium">
                {formatTransferQuantity(remaining, a.baseUnit)}
              </dd>
            </div>
          )}
        </dl>
      )}
      {t.state === "in_transit" && integer(remaining) > 0n && (
        <>
          <form onSubmit={save}>
            <fieldset
              disabled={locked}
              className="grid items-end gap-3 sm:grid-cols-2"
            >
              <label className={fieldClass}>
                <FieldCaption required>
                  {receiving ? "Cantidad recibida" : "Cantidad a resolver"}
                  {unit ? ` (${unit.label})` : ""}
                </FieldCaption>
                <Input
                  required
                  disabled={!unit}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  inputMode="decimal"
                  className="min-h-12"
                  placeholder="Ej.: 2,5"
                />
              </label>
              {!receiving && (
                <>
                  <label className={fieldClass}>
                    <FieldCaption required>Resolución</FieldCaption>
                    <select
                      required
                      className={selectClass}
                      value={kind}
                      onChange={(e) => setKind(e.target.value)}
                    >
                      <option value="loss">Pérdida en tránsito</option>
                      <option value="return">Regreso a origen</option>
                    </select>
                  </label>
                  <label className={fieldClass}>
                    <FieldCaption required>Motivo</FieldCaption>
                    <Input
                      required
                      maxLength={2000}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className="min-h-12"
                    />
                  </label>
                </>
              )}
              <Button type="submit" disabled={!unit} className="min-h-12">
                {receiving ? "Registrar recepción" : "Resolver diferencia"}
              </Button>
            </fieldset>
          </form>
          <OperationAlert
            title={
              receiving
                ? "No pudimos registrar la recepción"
                : "No pudimos resolver la diferencia"
            }
            message={error}
            eventKey={errorAttempt}
            tone="error"
          />
        </>
      )}
    </div>
  );
}
