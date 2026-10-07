"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getJson, SearchSelect, useOperation, quantity } from "./shared";
import { decimal, integer, six } from "@/modules/inventory/decimal";
import type { LotRow } from "@/modules/inventory/types";
type Reservation = {
  allocation: {
    id: string;
    itemId: string;
    lotId: string;
    locationId: string;
    allocated: string;
    consumed: string;
    released: string;
  };
  itemName: string;
  lotCode: string | null;
  state: string;
};
export function InventoryExceptions({
  actorId,
  admin,
}: {
  actorId: string;
  admin: boolean;
}) {
  const [rows, setRows] = useState<Reservation[]>([]),
    [offset, setOffset] = useState(0),
    [more, setMore] = useState(false),
    [version, setVersion] = useState(0),
    [error, setError] = useState("");
  const saved = useCallback(() => setVersion((v) => v + 1), []),
    operation = useOperation<Record<string, unknown>>(
      actorId,
      "reservation",
      saved,
    );
  useEffect(() => {
    let live = true;
    getJson<{ rows: Reservation[]; hasMore: boolean }>(
      `/api/inventory/reservations?offset=${offset}`,
    )
      .then((r) => {
        if (live) {
          setRows(r.rows);
          setMore(r.hasMore);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [version, offset]);
  return (
    <section className="mt-8 space-y-5">
      <details className="surface-panel p-5">
        <summary className="cursor-pointer font-bold">
          Reservas de materiales
        </summary>
        <p className="my-3 text-sm text-muted">
          Si un lote reservado no puede utilizarse, reasigná la cantidad a otro
          lote de la misma ubicación. Los traslados se anulan y se vuelven a
          confirmar.
        </p>
        {(error || operation.error) && (
          <p role="alert">{error || operation.error}</p>
        )}
        {operation.uncertain && (
          <Button onClick={operation.retry}>Reintentar el mismo envío</Button>
        )}
        {rows.map((row) => (
          <ReservationRow
            key={`${row.allocation.id}:${version}`}
            row={row}
            locked={operation.locked}
            submit={operation.submit}
          />
        ))}
        <Pager offset={offset} more={more} change={setOffset} />
      </details>
      {admin && <RecallPanel actorId={actorId} />}
    </section>
  );
}
function Pager({
  offset,
  more,
  change,
}: {
  offset: number;
  more: boolean;
  change: (n: number) => void;
}) {
  return (
    <div className="my-3 flex gap-2">
      <Button
        type="button"
        variant="outline"
        disabled={!offset}
        onClick={() => change(Math.max(0, offset - 100))}
      >
        Anteriores
      </Button>
      <Button
        type="button"
        variant="outline"
        disabled={!more}
        onClick={() => change(offset + 100)}
      >
        Siguientes
      </Button>
    </div>
  );
}
function ReservationRow({
  row,
  locked,
  submit,
}: {
  row: Reservation;
  locked: boolean;
  submit: (url: string, payload: Record<string, unknown>) => void;
}) {
  const a = row.allocation,
    remaining = six(
      integer(a.allocated) - integer(a.consumed) - integer(a.released),
    );
  const [lots, setLots] = useState<LotRow[]>([]),
    [offset, setOffset] = useState(0),
    [more, setMore] = useState(false),
    [open, setOpen] = useState(false),
    [selected, setSelected] = useState(""),
    [amount, setAmount] = useState(remaining.replace(".", ",")),
    [reason, setReason] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    if (!open) return;
    let live = true;
    getJson<{ lots: { rows: LotRow[]; total: number } }>(
      `/api/inventory/${a.itemId}?lotOffset=${offset}`,
    )
      .then((r) => {
        if (live) {
          setLots(r.lots.rows);
          setMore(r.lots.total > offset + 100);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [a.itemId, offset, open]);
  function save(e: FormEvent) {
    e.preventDefault();
    try {
      submit("/api/inventory/reservations", {
        requestId: crypto.randomUUID(),
        allocationId: a.id,
        replacementLotId: selected,
        quantity: decimal(amount, 6, true, true),
        reason,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revisá la cantidad.");
    }
  }
  return (
    <details
      className="border-t py-3"
      onToggle={(e) => setOpen(e.currentTarget.open)}
    >
      <summary className="cursor-pointer text-sm">
        {row.itemName} · lote {row.lotCode ?? a.lotId.slice(0, 8)} · reservado{" "}
        {quantity(remaining)}
        {row.state === "affected" ? " · requiere revisión" : ""}
      </summary>
      <form onSubmit={save}>
        <fieldset disabled={locked} className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            Lote de reemplazo
            <select
              required
              className="block rounded border p-2"
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Elegí un lote disponible</option>
              {lots
                .filter(
                  (l) =>
                    l.id !== a.lotId &&
                    l.locationId === a.locationId &&
                    !l.blocked &&
                    !l.expired &&
                    integer(l.remainingQuantity) > integer(l.reservedQuantity),
                )
                .map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.lotCode ?? l.receivedOn} · {l.locationName} · disponible{" "}
                    {quantity(
                      six(
                        integer(l.remainingQuantity) -
                          integer(l.reservedQuantity),
                      ),
                    )}
                  </option>
                ))}
            </select>
            <Pager
              offset={offset}
              more={more}
              change={(n) => {
                setOffset(n);
                setSelected("");
              }}
            />
          </label>
          <label className="text-sm">
            Cantidad
            <Input
              required
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
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
          <Button type="submit">Reasignar reserva</Button>
        </fieldset>
        {error && <p role="alert">{error}</p>}
      </form>
    </details>
  );
}
type RecallLot = {
  id: string;
  lotCode: string | null;
  receivedOn: string;
  blocked: boolean;
  revision: number;
};
function RecallPanel({ actorId }: { actorId: string }) {
  const [item, setItem] = useState(""),
    [lots, setLots] = useState<RecallLot[]>([]),
    [offset, setOffset] = useState(0),
    [more, setMore] = useState(false),
    [selected, setSelected] = useState(""),
    [reason, setReason] = useState(""),
    [version, setVersion] = useState(0),
    [error, setError] = useState("");
  const saved = useCallback(() => {
      setVersion((v) => v + 1);
      setSelected("");
    }, []),
    operation = useOperation<Record<string, unknown>>(actorId, "recall", saved);
  useEffect(() => {
    if (!item) return;
    let live = true;
    getJson<{ rows: RecallLot[]; hasMore: boolean }>(
      `/api/inventory/recalls?itemId=${item}&offset=${offset}`,
    )
      .then((r) => {
        if (live) {
          setLots(r.rows);
          setMore(r.hasMore);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [item, offset, version]);
  function save(e: FormEvent) {
    e.preventDefault();
    const lot = lots.find((l) => l.id === selected);
    if (lot)
      operation.submit("/api/inventory/recalls", {
        requestId: crypto.randomUUID(),
        lotId: lot.id,
        expectedRevision: lot.revision,
        blocked: !lot.blocked,
        reason,
      });
  }
  return (
    <details className="surface-panel p-5">
      <summary className="cursor-pointer font-bold">
        Retiro de lote en todas las sucursales
      </summary>
      <p className="my-3 text-sm text-muted">
        Bloquea el lote en todo el negocio. Levantar un retiro global conserva
        los bloqueos locales existentes.
      </p>
      {(error || operation.error) && (
        <p role="alert">{error || operation.error}</p>
      )}
      {operation.uncertain && (
        <Button onClick={operation.retry}>Reintentar el mismo envío</Button>
      )}
      <form onSubmit={save}>
        <fieldset
          disabled={operation.locked}
          className="grid gap-3 sm:grid-cols-2"
        >
          <SearchSelect
            entity="items"
            label="Artículo"
            value={item}
            onChange={(id) => {
              setItem(id);
              setOffset(0);
              setSelected("");
              setLots([]);
            }}
          />
          <label className="text-sm">
            Lote
            <select
              required
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              className="block rounded border p-2"
            >
              <option value="">Elegí un lote</option>
              {lots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.lotCode ?? l.receivedOn} ·{" "}
                  {l.blocked ? "retirado globalmente" : "sin retiro global"}
                </option>
              ))}
            </select>
            <Pager
              offset={offset}
              more={more}
              change={(n) => {
                setOffset(n);
                setSelected("");
              }}
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
          <Button type="submit" disabled={!selected}>
            {lots.find((l) => l.id === selected)?.blocked
              ? "Levantar retiro global"
              : "Retirar lote en todas las sucursales"}
          </Button>
        </fieldset>
      </form>
    </details>
  );
}
