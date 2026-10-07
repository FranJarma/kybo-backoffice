"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { getJson, useOperation, quantity } from "@/components/inventory/shared";
import { LocationSelect } from "@/components/branches/location-select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { decimal, integer, six } from "@/modules/inventory/decimal";
type Row = {
  returnLots: { lotId: string; lotCode: string | null; quantity: string }[];
  lineId: string;
  name: string;
  orderId: string;
  progress: {
    mode: string;
    ordered: number;
    completed: number;
    delivered: number;
    cancelled: number;
  };
  task: {
    id: string;
    status: string;
    revision: number;
    assigneeId: string | null;
  } | null;
};
type State = {
  rows: Row[];
  cancelled: boolean;
  resolution: { id: string; state: string } | null;
};
export function SaleFulfillmentPanel({
  actorId,
  saleId,
  canManage,
}: {
  actorId: string;
  saleId: string;
  canManage: boolean;
}) {
  const [data, setData] = useState<State>(),
    [version, setVersion] = useState(0),
    [error, setError] = useState("");
  const refresh = useCallback(() => setVersion((v) => v + 1), []);
  const operation = useOperation<Record<string, unknown>>(
    actorId,
    "fulfillment",
    refresh,
  );
  useEffect(() => {
    let live = true;
    getJson<State>(`/api/fulfillment/state?saleId=${saleId}`)
      .then((r) => {
        if (live) setData(r);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [saleId, version]);
  return (
    <div className="surface-panel space-y-4 p-5">
      <h3 className="font-bold">Preparación y entrega</h3>
      {(error || operation.error) && (
        <p role="alert" className="text-red-700">
          {error || operation.error}
        </p>
      )}
      {operation.uncertain && (
        <Button onClick={operation.retry}>Reintentar el mismo envío</Button>
      )}
      {data?.rows.map((row) => (
        <ProgressRow
          key={`${row.lineId}:${version}`}
          row={row}
          actorId={actorId}
          disabled={operation.locked || data.cancelled}
          submit={operation.submit}
        />
      ))}
      {canManage &&
        data?.rows
          .filter((r) => r.returnLots.length > 0)
          .map((row) => (
            <ReturnRow
              key={`return:${row.lineId}:${version}`}
              row={row}
              disabled={operation.locked}
              submit={operation.submit}
            />
          ))}
      {data?.rows.length === 0 && (
        <p className="text-sm text-muted">
          Venta anterior al corte de inventario. Se conserva su historial sin
          generar consumos retroactivos.
        </p>
      )}
      {data?.resolution?.state === "pending" &&
        (canManage ? (
          <ResolutionPanel
            key={`${data.resolution.id}:${version}`}
            id={data.resolution.id}
            actorId={actorId}
            onSaved={refresh}
          />
        ) : (
          <p role="status">
            Un encargado debe resolver los materiales de la preparación
            cancelada.
          </p>
        ))}
    </div>
  );
}
function ProgressRow({
  row: r,
  actorId,
  disabled,
  submit,
}: {
  row: Row;
  actorId: string;
  disabled: boolean;
  submit: (url: string, payload: Record<string, unknown>) => void;
}) {
  const [amount, setAmount] = useState(1);
  const completing =
    r.progress.mode === "recipe" &&
    r.task?.status === "preparing" &&
    r.task.assigneeId === actorId;
  const remaining = completing
    ? r.progress.ordered - r.progress.completed - r.progress.cancelled
    : (r.progress.mode === "direct"
        ? r.progress.ordered - r.progress.cancelled
        : r.progress.completed) - r.progress.delivered;
  function save(e: FormEvent) {
    e.preventDefault();
    submit(`/api/fulfillment/${completing ? "complete" : "deliver"}`, {
      requestId: crypto.randomUUID(),
      lines: [{ saleLineId: r.lineId, quantity: amount }],
      ...(completing
        ? { taskId: r.task!.id, expectedRevision: r.task!.revision }
        : { orderId: r.orderId }),
    });
  }
  return (
    <div className="space-y-2 border-t pt-3">
      <p className="text-sm font-semibold">{r.name}</p>
      <p className="text-xs text-muted">
        Pedido: {r.progress.ordered} · Preparado: {r.progress.completed} ·
        Entregado: {r.progress.delivered} · Cancelado: {r.progress.cancelled}
      </p>
      {remaining > 0 && !disabled && (
        <form onSubmit={save} className="flex items-end gap-3">
          <label className="text-sm">
            Cantidad
            <Input
              type="number"
              min={1}
              max={remaining}
              step={1}
              required
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
          </label>
          <Button type="submit">
            {completing ? "Terminar preparación" : "Entregar"}
          </Button>
        </form>
      )}
    </div>
  );
}
type Resolution = {
  revision: number;
  lines: {
    id: string;
    itemName?: string;
    pending: string;
    consumed: string;
    unused: string;
  }[];
};
function ResolutionPanel({
  id,
  actorId,
  onSaved,
}: {
  id: string;
  actorId: string;
  onSaved: () => void;
}) {
  const [data, setData] = useState<Resolution>(),
    [error, setError] = useState("");
  const operation = useOperation<Record<string, unknown>>(
    actorId,
    "stock-resolution",
    onSaved,
  );
  useEffect(() => {
    let live = true;
    getJson<Resolution>(`/api/stock-resolutions/${id}`)
      .then((r) => {
        if (live) setData(r);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [id]);
  return (
    <div className="space-y-3 rounded-lg border border-amber-300 p-4">
      <h4 className="font-semibold">Materiales de la preparación cancelada</h4>
      <p className="text-sm">
        Indicá lo realmente consumido y lo que quedó sin usar.
      </p>
      {(error || operation.error) && (
        <p role="alert">{error || operation.error}</p>
      )}
      {operation.uncertain && (
        <Button onClick={operation.retry}>Reintentar el mismo envío</Button>
      )}
      {data?.lines.map((line) => (
        <ResolutionRow
          key={line.id}
          id={id}
          revision={data.revision}
          line={line}
          locked={operation.locked}
          submit={operation.submit}
        />
      ))}
    </div>
  );
}
function ResolutionRow({
  id,
  revision,
  line,
  locked,
  submit,
}: {
  id: string;
  revision: number;
  line: Resolution["lines"][number];
  locked: boolean;
  submit: (url: string, payload: Record<string, unknown>) => void;
}) {
  const [used, setUsed] = useState("0"),
    [unused, setUnused] = useState("0"),
    [reason, setReason] = useState(""),
    [error, setError] = useState("");
  const remaining = six(
    integer(line.pending) - integer(line.consumed) - integer(line.unused),
  );
  if (integer(remaining) === 0n) return null;
  function save(e: FormEvent) {
    e.preventDefault();
    try {
      submit(`/api/stock-resolutions/${id}`, {
        requestId: crypto.randomUUID(),
        expectedRevision: revision,
        reason,
        lines: [
          {
            resolutionLineId: line.id,
            consumed: decimal(used, 6),
            unused: decimal(unused, 6),
          },
        ],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revisá las cantidades.");
    }
  }
  return (
    <form onSubmit={save} className="border-t pt-3">
      <p className="mb-2 text-sm font-semibold">
        {line.itemName ?? "Material reservado"} · pendiente{" "}
        {quantity(remaining)}
      </p>
      <fieldset disabled={locked} className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          Consumido
          <Input
            required
            value={used}
            inputMode="decimal"
            onChange={(e) => setUsed(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Sin usar
          <Input
            required
            value={unused}
            inputMode="decimal"
            onChange={(e) => setUnused(e.target.value)}
          />
        </label>
        <label className="text-sm">
          Motivo
          <Input
            required
            maxLength={2000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <Button type="submit">Guardar resolución</Button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

function ReturnRow({
  row,
  disabled,
  submit,
}: {
  row: Row;
  disabled: boolean;
  submit: (url: string, payload: Record<string, unknown>) => void;
}) {
  const [lot, setLot] = useState(""),
    [location, setLocation] = useState(""),
    [amount, setAmount] = useState(""),
    [reason, setReason] = useState(""),
    [error, setError] = useState("");
  function save(e: FormEvent) {
    e.preventDefault();
    try {
      submit("/api/fulfillment/return", {
        requestId: crypto.randomUUID(),
        saleLineId: row.lineId,
        lotId: lot,
        locationId: location,
        quantity: decimal(amount, 6, true, true),
        reason,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revisá la cantidad.");
    }
  }
  return (
    <details className="border-t pt-3">
      <summary className="cursor-pointer text-sm font-semibold">
        Devolución física · {row.name}
      </summary>
      <p className="my-2 text-sm text-muted">
        Registrá sólo mercadería que efectivamente volvió al local. Esto no
        realiza un reintegro de dinero.
      </p>
      <form onSubmit={save}>
        <fieldset disabled={disabled} className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Lote entregado
            <select
              required
              value={lot}
              onChange={(e) => setLot(e.target.value)}
              className="block w-full rounded border p-2"
            >
              <option value="">Elegí el lote</option>
              {row.returnLots.map((l) => (
                <option key={l.lotId} value={l.lotId}>
                  {l.lotCode ?? l.lotId.slice(0, 8)} · hasta{" "}
                  {quantity(l.quantity)} unidades base
                </option>
              ))}
            </select>
          </label>
          <LocationSelect value={location} onChange={setLocation} />
          <label className="text-sm">
            Cantidad en unidad base
            <Input
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
            />
          </label>
          <label className="text-sm">
            Motivo
            <Input
              required
              value={reason}
              maxLength={2000}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <Button type="submit">Registrar devolución física</Button>
        </fieldset>
        {error && <p role="alert">{error}</p>}
      </form>
    </details>
  );
}
