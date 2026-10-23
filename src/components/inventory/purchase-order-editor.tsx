"use client";
import { useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CatalogRow } from "@/modules/catalog/types";
import type { CreateOrderInput } from "@/modules/procurement/types";
import {
  decimal,
  exactDivision,
  integer,
  safeQuantity,
  SCALE,
} from "@/modules/inventory/decimal";
import { SearchSelect, today, quantity } from "./shared";
type Line = {
  key: string;
  itemId: string;
  item?: CatalogRow;
  presentationId: string;
  presentation?: CatalogRow;
  quantity: string;
};
const blank = (): Line => ({
  key: crypto.randomUUID(),
  itemId: "",
  presentationId: "",
  quantity: "",
});
export function PurchaseOrderEditor({
  timeZone,
  locked,
  onCancel,
  onSave,
}: {
  timeZone: string;
  locked: boolean;
  onCancel: () => void;
  onSave: (input: CreateOrderInput) => void;
}) {
  const [supplierId, setSupplierId] = useState(""),
    [orderedOn, setOrderedOn] = useState(today(timeZone)),
    [expectedOn, setExpectedOn] = useState(""),
    [notes, setNotes] = useState(""),
    [lines, setLines] = useState<Line[]>(() => [blank()]),
    [error, setError] = useState("");
  const change = (key: string, patch: Partial<Line>) =>
    setLines((old) => old.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      for (const l of lines) {
        if (!l.itemId) throw new Error("Elegí el insumo de cada renglón.");
        const value = integer(decimal(l.quantity, 6, true, true)!);
        if (
          (l.presentationId || l.item?.baseUnit === "unit") &&
          value % SCALE !== 0n
        )
          throw new Error(
            "Las unidades y presentaciones se piden en cantidades enteras.",
          );
        safeQuantity(
          exactDivision(
            value * integer(String(l.presentation?.baseQuantity ?? "1.000000")),
            SCALE,
          ),
        );
      }
      if (expectedOn && expectedOn < orderedOn)
        throw new Error("La llegada no puede ser anterior al pedido.");
      onSave({
        requestId: crypto.randomUUID(),
        supplierId,
        orderedOn,
        expectedOn: expectedOn || null,
        notes,
        lines: lines.map((l) => ({
          itemId: l.itemId,
          presentationId: l.presentationId || null,
          quantity: l.quantity,
        })),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Revisá el pedido.");
    }
  }
  return (
    <form
      onSubmit={submit}
      className="space-y-6 rounded-xl border border-line bg-white p-5 sm:p-7"
    >
      <div>
        <h2 className="text-xl font-bold">Nuevo pedido a proveedor</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Primero guardás el borrador. Confirmalo cuando el pedido esté acordado
          con el proveedor.
        </p>
      </div>
      <fieldset disabled={locked} className="space-y-6">
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <SearchSelect
              entity="suppliers"
              label="Proveedor"
              required
              value={supplierId}
              onChange={(id) => {
                setSupplierId(id);
                setLines((old) =>
                  old.map((l) => ({
                    ...l,
                    presentationId: "",
                    presentation: undefined,
                  })),
                );
              }}
            />
          </div>
          <label className="space-y-2 text-sm font-semibold">
            Fecha del pedido
            <Input
              type="date"
              required
              max={today(timeZone)}
              value={orderedOn}
              onChange={(e) => setOrderedOn(e.target.value)}
            />
          </label>
          <label className="space-y-2 text-sm font-semibold">
            Llegada estimada{" "}
            <span className="font-normal text-muted-foreground">
              (opcional)
            </span>
            <Input
              type="date"
              min={orderedOn}
              value={expectedOn}
              onChange={(e) => setExpectedOn(e.target.value)}
            />
          </label>
        </div>
        {!expectedOn && (
          <p className="rounded-lg bg-blue-50 p-3 text-sm">
            Sin fecha confirmada, el tablero pedirá consultar al proveedor y no
            contará esta mercadería para cubrir faltantes.
          </p>
        )}
        <div className="space-y-4">
          {lines.map((l, index) => (
            <section
              key={l.key}
              aria-label={`Insumo ${index + 1}`}
              className="rounded-lg border border-line p-4"
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-sm font-bold">Insumo {index + 1}</h3>
                {lines.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    aria-label={`Quitar insumo ${index + 1}`}
                    onClick={() =>
                      setLines((old) => old.filter((i) => i.key !== l.key))
                    }
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <SearchSelect
                  entity="items"
                  label="Insumo"
                  value={l.itemId}
                  required
                  onChange={(id, item) =>
                    change(l.key, {
                      itemId: id,
                      item,
                      presentationId: "",
                      presentation: undefined,
                    })
                  }
                  filter={(i) =>
                    i.purchasable === true && i.stockTracked !== false
                  }
                />
                <SearchSelect
                  entity="presentations"
                  label="Presentación"
                  value={l.presentationId}
                  disabled={!supplierId || !l.itemId}
                  filter={(p) =>
                    p.itemId === l.itemId && p.supplierId === supplierId
                  }
                  onChange={(id, presentation) =>
                    change(l.key, { presentationId: id, presentation })
                  }
                />
              </div>
              <label className="mt-4 block space-y-2 text-sm font-semibold">
                Cantidad a pedir{" "}
                {l.presentation
                  ? `· ${l.presentation.name}`
                  : l.item
                    ? `· ${l.item.baseUnit === "unit" ? "unidades" : l.item.baseUnit}`
                    : ""}
                <Input
                  required
                  inputMode="decimal"
                  placeholder="0"
                  value={l.quantity}
                  onChange={(e) => change(l.key, { quantity: e.target.value })}
                />
              </label>
              <p className="mt-2 text-xs text-muted-foreground">
                {l.presentation
                  ? `Cada ${l.presentation.name} equivale a ${quantity(String(l.presentation.baseQuantity), String(l.item?.baseUnit ?? ""))}. Ingresá presentaciones enteras.`
                  : "Sin presentación, ingresá la cantidad en la unidad indicada del insumo."}{" "}
                Usá coma para decimales.
              </p>
            </section>
          ))}
        </div>
        <Button
          type="button"
          variant="outline"
          className="min-h-12 w-full border-dashed"
          disabled={lines.length >= 30}
          onClick={() => setLines((old) => [...old, blank()])}
        >
          <Plus className="size-4" />
          Agregar insumo
        </Button>
        <label className="block space-y-2 text-sm font-semibold">
          Notas <span className="font-normal">(opcional)</span>
          <Input
            maxLength={2000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Referencia acordada con el proveedor"
          />
        </label>
      </fieldset>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <footer className="flex flex-wrap justify-end gap-3 border-t border-line pt-5">
        <Button
          type="button"
          variant="outline"
          disabled={locked}
          onClick={onCancel}
        >
          Cancelar
        </Button>
        <Button className="min-h-12" disabled={locked}>
          Guardar borrador
        </Button>
      </footer>
    </form>
  );
}
