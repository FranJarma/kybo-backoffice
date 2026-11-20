"use client";
import { useState } from "react";
import Link from "next/link";
import { Truck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { StockRow } from "@/modules/daily-operations/types";
import {
  summarizeStockByItem,
  stockNeedsReplenishment,
} from "@/modules/daily-operations/stock-summary";
import { formatTransferQuantity as amount } from "@/modules/transfers/quantities";
const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLocaleLowerCase("es-AR")
    .trim();
function PolicyState({ row }: { row: StockRow }) {
  return (
    <span
      className={`text-xs font-semibold ${stockNeedsReplenishment(row) ? "text-amber-800" : "text-muted"}`}
    >
      {row.minimumQuantity === undefined
        ? "Sin mínimo configurado"
        : stockNeedsReplenishment(row)
          ? "Reponer"
          : "Mínimo cubierto"}
    </span>
  );
}
export function StockByLocation({
  rows,
  locationId,
  canManage = false,
}: {
  rows: StockRow[];
  locationId: string;
  canManage?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [onlyNeeds, setOnlyNeeds] = useState(false);
  const summaries = summarizeStockByItem(rows, locationId);
  const filtered = summaries.filter(
    (row) =>
      normalize(row.itemName).includes(normalize(search)) &&
      (!canManage || !onlyNeeds || row.locations.some(stockNeedsReplenishment)),
  );
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / 50) - 1),
  );
  const needs = summaries.filter((row) =>
    row.locations.some(stockNeedsReplenishment),
  ).length;
  return (
    <section className="space-y-4" aria-label="Stock por ubicación">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-[220px] flex-1">
          <h2 className="text-lg font-bold">Stock por ubicación</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            {locationId
              ? "Disponible en la ubicación seleccionada."
              : "Compará el disponible de cada ubicación. El total de la sucursal no reemplaza el mínimo de Barra o Cocina."}
          </p>
        </div>
        {canManage && (
          <Button variant="outline" className="min-h-12" asChild>
            <Link href="/inventory/transfers" prefetch={false}>
              <Truck className="size-4" />
              Preparar traslado
            </Link>
          </Button>
        )}
      </header>
      <div className="flex flex-wrap items-end gap-x-5 gap-y-3">
        <label className="grid w-full min-w-0 gap-1.5 text-xs font-semibold text-muted sm:w-auto sm:flex-1 sm:max-w-md">
          Buscar insumo
          <Input
            aria-label="Buscar insumo"
            placeholder="Nombre del insumo…"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            className="min-h-12 bg-white"
          />
        </label>
        {canManage && (
          <label className="flex min-h-12 items-center gap-2 text-sm font-semibold">
            <input
              type="checkbox"
              aria-label="Solo insumos para reponer"
              checked={onlyNeeds}
              onChange={(event) => {
                setOnlyNeeds(event.target.checked);
                setPage(0);
              }}
              className="size-4 accent-blue"
            />
            Solo insumos para reponer{" "}
            <span className="text-muted">({needs})</span>
          </label>
        )}
      </div>
      <details className="text-sm text-muted">
        <summary className="min-h-11 content-center cursor-pointer font-semibold text-blue">
          Cómo se calcula el disponible
        </summary>
        <p className="max-w-3xl pb-3 leading-relaxed">
          Disponible = físico − reservado − no utilizable. Lo reservado ya tiene
          un destino; lo no utilizable incluye stock vencido o bloqueado. Los
          mínimos y objetivos se configuran por ubicación.
        </p>
      </details>
      <div className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white">
        {filtered.slice(currentPage * 50, currentPage * 50 + 50).map((row) => {
          const shortages = row.locations.filter(stockNeedsReplenishment);
          const location = row.locations[0];
          return (
            <article key={row.itemId} className="min-w-0 p-4 sm:p-5">
              <header className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="break-words text-base font-bold text-brand">
                    {row.itemName}
                  </h3>
                  <p className="mt-1 text-xs text-muted">
                    {locationId
                      ? location.locationName
                      : "Total de la sucursal"}
                  </p>
                  {canManage && !locationId && shortages.length > 0 && (
                    <p className="mt-2 text-xs font-semibold text-amber-800">
                      Reponer en {shortages.length}{" "}
                      {shortages.length === 1 ? "ubicación" : "ubicaciones"}
                    </p>
                  )}
                  {canManage && locationId && <PolicyState row={location} />}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-muted">Disponible</p>
                  <p
                    data-stock-total
                    className="mt-1 text-lg font-extrabold tabular-nums text-brand"
                  >
                    {amount(row.available, row.unit)}
                  </p>
                </div>
              </header>
              {locationId ? (
                canManage && (
                  <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-line pt-3 text-sm">
                    <div>
                      <dt className="text-xs text-muted">Mínimo</dt>
                      <dd className="mt-1 font-semibold tabular-nums">
                        {location.minimumQuantity === undefined
                          ? "Sin configurar"
                          : amount(location.minimumQuantity, row.unit)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Objetivo</dt>
                      <dd className="mt-1 font-semibold tabular-nums">
                        {location.targetQuantity === undefined
                          ? "Sin configurar"
                          : amount(location.targetQuantity, row.unit)}
                      </dd>
                    </div>
                  </dl>
                )
              ) : (
                <ul
                  aria-label={`Disponible por ubicación de ${row.itemName}`}
                  className="mt-4 divide-y divide-line border-t border-line"
                >
                  {row.locations.map((balance) => (
                    <li
                      key={balance.locationId}
                      className={`grid gap-2 py-3 ${canManage ? "grid-cols-3 sm:grid-cols-[minmax(0,1.3fr)_repeat(3,minmax(0,1fr))]" : "grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]"}`}
                    >
                      <div
                        className={
                          canManage
                            ? "col-span-3 flex flex-wrap items-center gap-x-3 gap-y-1 sm:col-span-1 sm:block"
                            : "min-w-0"
                        }
                      >
                        <p className="break-words text-sm font-semibold text-brand">
                          {balance.locationName}
                        </p>
                        {canManage && <PolicyState row={balance} />}
                      </div>
                      <div>
                        <p className="text-xs text-muted">Disponible</p>
                        <p className="mt-1 break-words text-sm font-semibold tabular-nums">
                          {amount(balance.available, row.unit)}
                        </p>
                      </div>
                      {canManage && (
                        <>
                          <div>
                            <p className="text-xs text-muted">Mínimo</p>
                            <p className="mt-1 break-words text-sm tabular-nums">
                              {balance.minimumQuantity === undefined
                                ? "—"
                                : amount(balance.minimumQuantity, row.unit)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted">Objetivo</p>
                            <p className="mt-1 break-words text-sm tabular-nums">
                              {balance.targetQuantity === undefined
                                ? "—"
                                : amount(balance.targetQuantity, row.unit)}
                            </p>
                          </div>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <details className="mt-3 border-t border-line text-sm">
                <summary className="min-h-12 content-center cursor-pointer font-semibold text-blue">
                  Ver físico, reservas y no utilizable
                </summary>
                <dl className="grid grid-cols-3 gap-3 pb-3">
                  {(
                    [
                      ["Físico", row.physical],
                      ["Reservado", row.reserved],
                      ["No utilizable", row.unusable],
                    ] as const
                  ).map(([label, value]) => (
                    <div key={label}>
                      <dt className="text-xs text-muted">{label}</dt>
                      <dd className="mt-1 break-words font-medium tabular-nums">
                        {amount(value, row.unit)}
                      </dd>
                    </div>
                  ))}
                </dl>
              </details>
            </article>
          );
        })}
      </div>
      {!filtered.length && (
        <div className="rounded-xl border border-line bg-white p-6 text-center">
          <p className="font-semibold">
            {canManage && onlyNeeds
              ? "No hay insumos para reponer en esta vista"
              : "No hay insumos para esta búsqueda"}
          </p>
          <p className="mt-2 text-sm text-muted">
            {canManage && onlyNeeds
              ? "Se muestran solo los que están por debajo de un mínimo configurado."
              : "Probá otro nombre o cambiá la ubicación."}
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
        <span>
          {filtered.length} {filtered.length === 1 ? "insumo" : "insumos"}
          {filtered.length > 50
            ? ` · Página ${currentPage + 1} de ${Math.ceil(filtered.length / 50)}`
            : ""}
        </span>
        {filtered.length > 50 && (
          <nav aria-label="Páginas de stock" className="flex gap-2">
            <Button
              variant="outline"
              className="min-h-12"
              disabled={currentPage === 0}
              onClick={() => setPage(currentPage - 1)}
            >
              Página anterior
            </Button>
            <Button
              variant="outline"
              className="min-h-12"
              disabled={(currentPage + 1) * 50 >= filtered.length}
              onClick={() => setPage(currentPage + 1)}
            >
              Página siguiente
            </Button>
          </nav>
        )}
      </div>
    </section>
  );
}
