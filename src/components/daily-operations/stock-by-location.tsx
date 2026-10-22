"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { quantity } from "@/lib/number-format";
import type { StockRow } from "@/modules/daily-operations/types";
export function StockByLocation({
  rows,
  locationId,
}: {
  rows: StockRow[];
  locationId: string;
}) {
  const [search, setSearch] = useState(""),
    [page, setPage] = useState(0);
  const filtered = rows.filter(
    (r) =>
      (!locationId || r.locationId === locationId) &&
      r.itemName.toLocaleLowerCase().includes(search.toLocaleLowerCase()),
  );
  const currentPage = Math.min(
    page,
    Math.max(0, Math.ceil(filtered.length / 50) - 1),
  );
  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Stock por ubicación</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Disponible = físico − reservado − no utilizable. Cada artículo
          conserva su unidad.
        </p>
      </div>
      <Input
        aria-label="Buscar insumo"
        placeholder="Buscar un insumo…"
        value={search}
        onChange={(e) => {
          setSearch(e.target.value);
          setPage(0);
        }}
        className="min-h-12 max-w-lg"
      />
      <div className="grid gap-3 lg:grid-cols-2">
        {filtered.slice(currentPage * 50, currentPage * 50 + 50).map((r) => (
          <article
            key={`${r.itemId}:${r.locationId}`}
            className="min-w-0 rounded-xl border bg-white p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="break-words font-semibold text-brand">
                  {r.itemName}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {r.locationName}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs text-muted-foreground">Disponible</p>
                <p className="text-xl font-bold tabular-nums text-brand">
                  {quantity(r.available)}{" "}
                  <span className="text-xs font-normal">{r.unit}</span>
                </p>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-3 gap-2 border-t pt-3 text-sm">
              {[
                ["Físico", r.physical],
                ["Reservado", r.reserved],
                ["No utilizable", r.unusable],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs text-muted-foreground">{label}</dt>
                  <dd className="mt-1 tabular-nums">
                    {quantity(value)} {r.unit}
                  </dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <p className="py-8 text-muted-foreground">
          No hay insumos para esta búsqueda.
        </p>
      )}
      <div className="flex items-center justify-between gap-3 text-sm">
        <span>{filtered.length} registros</span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="min-h-12"
            disabled={currentPage === 0}
            onClick={() => setPage(currentPage - 1)}
          >
            Anterior
          </Button>
          <Button
            variant="outline"
            className="min-h-12"
            disabled={(currentPage + 1) * 50 >= filtered.length}
            onClick={() => setPage(currentPage + 1)}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </section>
  );
}
