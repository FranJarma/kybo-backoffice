"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { getJson, SearchSelect, useOperation, quantity } from "./shared";
import { decimal } from "@/modules/inventory/decimal";
import type { LotRow } from "@/modules/inventory/types";
export function InternalUseManager({ actorId }: { actorId: string }) {
  const [offset, setOffset] = useState(0),
    [total, setTotal] = useState(0);
  const [item, setItem] = useState(""),
    [lots, setLots] = useState<LotRow[]>([]),
    [selected, setSelected] = useState(""),
    [amount, setAmount] = useState(""),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0),
    [notice, setNotice] = useState("");
  const success = useCallback(() => {
    setVersion((v) => v + 1);
    setAmount("");
    setNotice("Consumo registrado.");
  }, []);
  const operation = useOperation<Record<string, unknown>>(
    actorId,
    "internal-use",
    success,
  );
  useEffect(() => {
    if (!item) return;
    let live = true;
    getJson<{ lots: { rows: LotRow[]; total: number } }>(
      `/api/inventory/${item}?lotOffset=${offset}`,
    )
      .then((r) => {
        if (live) {
          setLots(r.lots.rows);
          setTotal(r.lots.total);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [item, version, offset]);
  function save(e: FormEvent) {
    e.preventDefault();
    try {
      const lot = lots.find((l) => `${l.id}:${l.locationId}` === selected);
      if (!lot) throw new Error("Elegí el lote y su ubicación.");
      operation.submit("/api/inventory/internal-use", {
        requestId: crypto.randomUUID(),
        reason,
        allocations: [
          {
            itemId: item,
            lotId: lot.id,
            locationId: lot.locationId,
            quantity: decimal(amount, 6, true, true),
          },
        ],
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revisá los datos.");
    }
  }
  return (
    <section className="max-w-2xl space-y-6">
      <header>
        <p className="eyebrow">Inventario y compras</p>
        <h1 className="text-3xl font-extrabold text-brand">Consumo interno</h1>
        <p className="mt-2 text-muted">
          Registrá los materiales utilizados por el local y el motivo de su
          salida.
        </p>
      </header>
      {(error || operation.error) && (
        <p role="alert" className="text-red-700">
          {error || operation.error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {operation.uncertain && (
        <Button onClick={operation.retry}>Reintentar el mismo envío</Button>
      )}
      <Card className="p-5">
        <form onSubmit={save}>
          <fieldset disabled={operation.locked} className="space-y-4">
            <SearchSelect
              entity="items"
              label="Artículo"
              value={item}
              onChange={(id) => {
                setItem(id);
                setOffset(0);
                setLots([]);
                setSelected("");
              }}
              required
            />
            <label className="block text-sm font-semibold">
              Lote y ubicación
              <select
                required
                value={selected}
                onChange={(e) => setSelected(e.target.value)}
                className="mt-2 block w-full rounded-lg border p-2"
              >
                <option value="">Elegí un lote disponible</option>
                {lots
                  .filter((l) => !l.blocked && !l.expired)
                  .map((l) => (
                    <option
                      key={`${l.id}:${l.locationId}`}
                      value={`${l.id}:${l.locationId}`}
                    >
                      {l.lotCode ?? l.receivedOn} · {l.locationName} ·{" "}
                      {quantity(l.remainingQuantity, l.baseUnit)}
                    </option>
                  ))}
              </select>
              <div className="mt-2 flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={!offset}
                  onClick={() => {
                    setOffset((v) => Math.max(0, v - 100));
                    setSelected("");
                  }}
                >
                  Lotes anteriores
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={offset + 100 >= total}
                  onClick={() => {
                    setOffset((v) => v + 100);
                    setSelected("");
                  }}
                >
                  Más lotes
                </Button>
              </div>
            </label>
            <label className="block text-sm font-semibold">
              Cantidad en unidad base
              <Input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
                inputMode="decimal"
              />
            </label>
            <label className="block text-sm font-semibold">
              Motivo
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                required
                maxLength={2000}
              />
            </label>
            <Button type="submit">Registrar consumo</Button>
          </fieldset>
        </form>
      </Card>
    </section>
  );
}
