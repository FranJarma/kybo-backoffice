"use client";
import { pageOffset } from "@/modules/products/pagination";
import { ProductPhoto } from "@/components/products/photo";
import { useEffect, useState } from "react";
import { Coffee, Minus, Plus, Search, ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getJson, money } from "@/components/inventory/shared";
import { inputDecimal } from "@/components/recipes/shared";
import { cents, decimal, integer } from "@/modules/inventory/decimal";
import type { SaleChannel, SaleLookup } from "@/modules/sales/types";
export type CartLine = {
  expectedFulfillmentVersionId?: string;
  expectedRecipeVersionId?: string | null;
  modifiers?: import("@/modules/modifiers/types").Selection[];
  modifierLabels?: string[];
  productId: string;
  name: string;
  quantity: number;
  price: string;
  expectedPrice: string | null;
  priceReason: string;
  notes: string;
};
export function cartTotal(lines: CartLine[]) {
  try {
    return cents(
      lines.reduce(
        (total, line) =>
          total + integer(decimal(line.price, 2)!) * BigInt(line.quantity),
        0n,
      ),
    );
  } catch {
    return null;
  }
}
export function ProductPicker({
  channel,
  locked,
  onAdd,
  refresh,
}: {
  channel: SaleChannel;
  locked: boolean;
  onAdd: (row: SaleLookup["rows"][number]) => void;
  refresh: number;
}) {
  const [category, setCategory] = useState(""),
    [offset, setOffset] = useState(0);
  const [q, setQ] = useState(""),
    [data, setData] = useState<SaleLookup>({ rows: [], total: 0 }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      getJson<SaleLookup>(
        `/api/sales/lookup?kind=products&channel=${channel}&q=${encodeURIComponent(q)}&category=${encodeURIComponent(category)}&offset=${offset}`,
      )
        .then((r) => {
          if (live) {
            setData(r);
            setOffset(pageOffset(offset, r.total));
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [channel, q, refresh, category, offset]);
  return (
    <section className="surface-panel p-4 sm:p-5">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-brand">Tu carta</h2>
          <p className="mt-1 text-xs text-muted">
            Seleccioná productos para armar el pedido.
          </p>
        </div>
        <span className="rounded-full bg-surface px-2.5 py-1 text-xs font-semibold text-muted">
          {data.total}
        </span>
      </div>
      <div className="relative mb-5">
        <Search size={17} className="absolute left-3.5 top-3.5 text-muted" />
        <Input
          className="pl-10"
          aria-label="Buscar productos"
          value={q}
          placeholder="Buscar un producto…"
          onChange={(e) => {
            setQ(e.target.value);
            setOffset(0);
          }}
        />
      </div>
      <label className="mb-4 block text-xs font-semibold text-muted">
        Categoría
        <select
          value={category}
          onChange={(e) => {
            setCategory(e.target.value);
            setOffset(0);
          }}
          className="form-control mt-2"
        >
          <option value="">Todas</option>
          <option value="none">Sin categoría</option>
          {data.categories?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>
      {error ? (
        <p role="alert" className="py-8 text-sm text-red-700">
          {error}
        </p>
      ) : loading ? (
        <p className="py-12 text-center text-sm text-muted" role="status">
          Cargando carta…
        </p>
      ) : data.rows.length === 0 ? (
        <div className="py-12 text-center">
          <Coffee size={30} className="mx-auto mb-3 text-muted" />
          <p className="text-sm font-semibold text-brand">
            {q || category
              ? "No hay productos con estos filtros"
              : "Tu carta todavía está vacía"}
          </p>
          <p className="mt-2 text-xs text-muted">
            {q || category
              ? "Probá otra categoría o buscá por otro nombre."
              : "Cargá los productos y sus precios para empezar."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 2xl:grid-cols-3">
          {data.rows.map((row) => (
            <button
              key={row.id}
              type="button"
              disabled={locked || !!row.temporarilySoldOut}
              aria-label={`Agregar ${row.name}`}
              onClick={() => onAdd(row)}
              className="group flex min-h-40 min-w-0 flex-col items-start rounded-xl border border-line bg-white p-4 text-left transition-colors hover:border-orange-300 hover:bg-orange-50/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue disabled:opacity-50"
            >
              <span className="mb-3 block w-full">
                <ProductPhoto id={row.imageAssetId} name={row.name} />
              </span>
              {row.temporarilySoldOut && (
                <span className="mb-2 text-xs font-bold text-amber-700">
                  Agotado temporalmente
                </span>
              )}
              <span className="mb-3 line-clamp-2 text-sm font-bold leading-snug text-brand">
                {row.name}
              </span>
              <span className="mt-auto flex w-full items-center justify-between gap-1">
                <span
                  className={`text-sm font-extrabold tabular-nums ${row.price === null ? "text-amber-700" : "text-brand"}`}
                >
                  {row.price === null ? "Sin precio" : money(row.price ?? null)}
                </span>
                <Plus size={17} className="shrink-0 text-orange-600" />
              </span>
            </button>
          ))}
        </div>
      )}
      {data.total > 30 && !loading && (
        <div className="mt-4 flex items-center justify-between gap-2 text-xs text-muted">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - 30))}
          >
            Anterior
          </Button>
          <span>
            {offset + 1}–{Math.min(offset + 30, data.total)} de {data.total}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={offset + 30 >= data.total}
            onClick={() => setOffset(offset + 30)}
          >
            Siguiente
          </Button>
        </div>
      )}
    </section>
  );
}
export function Cart({
  lines,
  onChange,
  locked,
  allowPrice,
  total,
  children,
  onEdit,
}: {
  onEdit?: (index: number) => void;
  lines: CartLine[];
  onChange: (lines: CartLine[]) => void;
  locked: boolean;
  allowPrice: boolean;
  total: string | null;
  children: React.ReactNode;
}) {
  const update = (i: number, data: Partial<CartLine>) =>
    onChange(lines.map((line, j) => (i === j ? { ...line, ...data } : line)));
  return (
    <section className="surface-panel overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 className="flex items-center gap-2 text-base font-extrabold text-brand">
          <ShoppingBag size={18} className="text-orange-600" />
          Pedido actual
        </h2>
        <span className="text-xs text-muted">
          {lines.reduce((n, l) => n + l.quantity, 0)} unid.
        </span>
      </div>
      <fieldset disabled={locked}>
        {lines.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <ShoppingBag size={32} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm font-semibold text-brand">
              Tu pedido empieza acá
            </p>
            <p className="mt-2 text-xs text-muted">
              Elegí un producto de la carta.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-line px-5">
            {lines.map((line, i) => {
              let changed = false;
              try {
                changed = decimal(line.price, 2) !== line.expectedPrice;
              } catch {
                changed = true;
              }
              return (
                <div key={`${line.productId}:${i}`} className="py-4">
                  {line.modifierLabels?.map((label, j) => (
                    <p key={j} className="mb-1 text-xs text-muted">
                      {label}
                    </p>
                  ))}
                  {line.modifiers !== undefined && (
                    <Button
                      variant="ghost"
                      size="sm"
                      type="button"
                      onClick={() => onEdit?.(i)}
                    >
                      Editar opciones
                    </Button>
                  )}
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 text-sm font-bold text-brand">
                      {line.name}
                    </p>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="size-8 min-h-8 shrink-0 text-muted"
                      aria-label={`Quitar ${line.name}`}
                      onClick={() => onChange(lines.filter((_, j) => i !== j))}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <div className="flex shrink-0 items-center rounded-lg border border-line">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-10"
                        disabled={line.quantity === 1 || locked}
                        aria-label={`Disminuir ${line.name}`}
                        onClick={() =>
                          update(i, { quantity: line.quantity - 1 })
                        }
                      >
                        <Minus size={14} />
                      </Button>
                      <span className="min-w-6 text-center text-sm font-bold tabular-nums">
                        {line.quantity}
                      </span>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-10"
                        disabled={line.quantity >= 999 || locked}
                        aria-label={`Aumentar ${line.name}`}
                        onClick={() =>
                          update(i, { quantity: line.quantity + 1 })
                        }
                      >
                        <Plus size={14} />
                      </Button>
                    </div>
                    <div className="w-32">
                      <label className="mb-1 block text-right font-semibold text-brand">
                        <span className="text-[10px] uppercase text-muted">
                          Precio unitario
                        </span>
                        <Input
                          aria-label={`Precio de ${line.name}`}
                          className="mt-1 text-right text-base font-semibold normal-case tabular-nums"
                          value={line.price}
                          inputMode="decimal"
                          disabled={locked || !allowPrice}
                          onChange={(e) => update(i, { price: e.target.value })}
                        />
                      </label>
                    </div>
                  </div>
                  {changed && (
                    <div className="mt-3">
                      <Input
                        aria-label={`Motivo del precio de ${line.name}`}
                        placeholder="Motivo del precio aplicado"
                        maxLength={240}
                        value={line.priceReason}
                        onChange={(e) =>
                          update(i, { priceReason: e.target.value })
                        }
                      />
                      <p className="mt-1 text-[11px] text-amber-800">
                        {line.expectedPrice === null
                          ? "No tiene precio cargado en este canal."
                          : `Precio de lista: ${money(line.expectedPrice)}`}
                      </p>
                    </div>
                  )}
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs font-medium text-muted">
                      Observaciones del producto
                    </summary>
                    <Input
                      className="mt-2"
                      aria-label={`Observaciones de ${line.name}`}
                      value={line.notes}
                      maxLength={500}
                      onChange={(e) => update(i, { notes: e.target.value })}
                      placeholder="Sin hielo, para compartir…"
                    />
                  </details>
                </div>
              );
            })}
          </div>
        )}
      </fieldset>
      <div className="border-t border-line bg-surface/40 p-5">
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm font-bold text-brand">Total del pedido</span>
          <strong
            data-testid="cart-total"
            className="text-2xl font-extrabold tabular-nums text-brand"
          >
            {total === null ? "Revisar" : money(total)}
          </strong>
        </div>
        {children}
      </div>
    </section>
  );
}
export function newCartLine(row: SaleLookup["rows"][number]): CartLine {
  return {
    expectedFulfillmentVersionId: row.fulfillmentVersionId ?? undefined,
    productId: row.id,
    name: row.name,
    quantity: 1,
    price:
      row.price === null || row.price === undefined
        ? ""
        : inputDecimal(row.price),
    expectedPrice: row.price ?? null,
    priceReason: "",
    notes: "",
  };
}
