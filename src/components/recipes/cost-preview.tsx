"use client";
import { Fragment, useEffect, useState } from "react";
import { recipeSection } from "@/modules/catalog/item-classes";
import { money, quantity } from "@/components/inventory/shared";

export type PreviewRow = {
  itemClass?: string;
  itemId: string;
  name?: string;
  baseUnit?: string;
  quantity: string;
  wastePercent?: string;
  multiplier?: string;
  count?: number;
  include?: boolean;
};
type Result = {
  rows: { consumption: string | null; cost: string | null; status: string }[];
  totalCost: string | null;
  knownSubtotal: string;
  unitCost: string | null;
};
export function CostPreview({
  rows,
  yieldQuantity = "1",
}: {
  rows: PreviewRow[];
  yieldQuantity?: string;
}) {
  const payload = JSON.stringify({
    yieldQuantity,
    rows: rows.map((row) => ({
      itemId: row.itemId,
      quantity: row.quantity,
      wastePercent: row.wastePercent,
      multiplier: row.multiplier,
      count: row.count,
      include: row.include,
    })),
  });
  const [state, setState] = useState<{
    payload: string;
    result?: Result;
    error?: string;
  }>();
  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const response = await fetch("/api/recipes/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
          signal: controller.signal,
        });
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error ?? "No pudimos calcular el costo.");
        if (!controller.signal.aborted) setState({ payload, result });
      } catch (error) {
        if (!controller.signal.aborted)
          setState({ payload, error: (error as Error).message });
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [payload]);
  const current = state?.payload === payload ? state : undefined;
  return (
    <section
      className="space-y-4 rounded-xl border border-line bg-blue-50/40 p-5 sm:p-6"
      aria-label="Costo estimado de la receta"
    >
      <h3 className="font-semibold text-brand">Costo estimado</h3>
      <p className="text-xs leading-relaxed text-muted">
        Ingresá cantidades útiles. El consumo incluye la merma y se redondea
        hacia arriba a seis decimales. El total usa las opciones
        predeterminadas; los costos pendientes no se consideran cero.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs text-muted">
              {["Componente", "Cantidad útil", "Merma", "Consumo", "Costo"].map(
                (label) => (
                  <th key={label} className="px-2 py-3 font-medium">
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {["Ingredientes", "Descartables", "Otros componentes"].map(
              (section) => {
                const entries = rows
                  .map((row, i) => ({ row, i }))
                  .filter(
                    ({ row }) => recipeSection(row.itemClass) === section,
                  );
                if (!entries.length) return null;
                return (
                  <Fragment key={section}>
                    <tr>
                      <th
                        colSpan={5}
                        scope="rowgroup"
                        className="bg-blue-50 px-2 py-3 font-semibold text-brand"
                      >
                        {section}
                      </th>
                    </tr>
                    {entries.map(({ row, i }) => (
                      <tr key={i} className="border-b border-line/60">
                        <td className="px-2 py-3">
                          {row.name || `Componente ${i + 1}`}
                          {row.include === false && (
                            <span className="block text-xs text-muted">
                              Alternativa, fuera del total
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-2 py-3">
                          {row.quantity || "—"} {row.baseUnit}
                          {row.multiplier && row.multiplier !== "1"
                            ? ` × ${row.multiplier}`
                            : ""}
                          {row.count !== undefined && row.count !== 1
                            ? ` × ${row.count}`
                            : ""}
                        </td>
                        <td className="px-2 py-3">
                          {row.wastePercent || "0"}%
                        </td>
                        <td className="whitespace-nowrap px-2 py-3">
                          {current?.result?.rows[i]?.consumption
                            ? quantity(
                                current.result.rows[i].consumption!,
                                row.baseUnit || "g",
                              )
                            : "—"}
                        </td>
                        <td className="whitespace-nowrap px-2 py-3">
                          {current?.result?.rows[i]?.cost != null
                            ? money(current.result.rows[i].cost)
                            : current?.result?.rows[i]?.status === "incomplete"
                              ? "Completá los datos"
                              : "Costo pendiente"}
                        </td>
                      </tr>
                    ))}
                  </Fragment>
                );
              },
            )}
          </tbody>
        </table>
      </div>
      <div
        aria-live="polite"
        className="flex flex-wrap justify-between gap-4 text-sm"
      >
        {!current ? (
          <span>Calculando…</span>
        ) : current.error ? (
          <p role="alert">{current.error}</p>
        ) : (
          <>
            <strong>
              Total:{" "}
              {current.result?.totalCost != null
                ? money(current.result.totalCost)
                : "Costo pendiente"}
            </strong>
            <span>
              Por unidad de rendimiento:{" "}
              {current.result?.unitCost != null
                ? money(current.result.unitCost, 6)
                : "—"}
            </span>
          </>
        )}
      </div>
    </section>
  );
}
