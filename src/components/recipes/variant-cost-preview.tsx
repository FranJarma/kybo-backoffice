"use client";
import { useEffect, useId, useState } from "react";
import { money } from "@/lib/number-format";
import { variantTotals } from "@/modules/recipes/variant-costs";
import { Input } from "@/components/ui/input";
import { OperationAlert } from "@/components/ui/operation-alert";
import type { PreviewRow } from "./cost-preview";

export type VariantGroup = {
  id: string;
  name: string;
  min: number;
  max: number;
  options: {
    id: string;
    name: string;
    max: number;
    defaultCount: number;
    instruction: boolean;
    rows: PreviewRow[];
  }[];
};

export function VariantCostPreview({
  fixed,
  groups,
  active = true,
}: {
  active?: boolean;
  fixed: PreviewRow[];
  groups: VariantGroup[];
}) {
  const id = useId();
  const [groupId, setGroupId] = useState(
    () =>
      (groups.find((g) => g.min === 1 && g.max === 1) ?? groups[0])?.id ?? "",
  );
  const [counts, setCounts] = useState<Record<string, number>>({});
  const target = groups.find((g) => g.id === groupId) ?? groups[0];
  const countFor = (g: VariantGroup, o: VariantGroup["options"][number]) =>
    counts[`${g.id}/${o.id}`] ?? o.defaultCount;
  const others = groups.filter((g) => g !== target);
  const invalid = others.find((g) => {
    const total = g.options.reduce((sum, o) => sum + countFor(g, o), 0);
    return (
      total < g.min ||
      total > g.max ||
      g.options.some(
        (o) =>
          !Number.isInteger(countFor(g, o)) ||
          countFor(g, o) < 0 ||
          countFor(g, o) > o.max,
      )
    );
  });
  const common = [
    ...fixed,
    ...others.flatMap((g) =>
      g.options.flatMap((o) =>
        countFor(g, o) > 0
          ? o.rows.map((row) => ({ ...row, count: countFor(g, o) }))
          : [],
      ),
    ),
  ];
  const incompleteCommon = others.some((g) =>
    g.options.some(
      (o) => countFor(g, o) > 0 && !o.instruction && o.rows.length === 0,
    ),
  );
  const alternatives = target?.options.filter((o) => o.max >= 1) ?? [];
  const allRows = [
    ...common,
    ...alternatives.flatMap((o) => o.rows.map((row) => ({ ...row, count: 1 }))),
  ];
  const payload = JSON.stringify({
    yieldQuantity: "1",
    rows: allRows.map((r) => ({
      itemId: r.itemId,
      quantity: r.quantity,
      wastePercent: r.wastePercent,
      multiplier: r.multiplier,
      count: r.count,
    })),
  });
  const [state, setState] = useState<{
    payload: string;
    costs?: (string | null)[];
    reference: boolean;
    error?: string;
  }>();
  const canCompare = !!target && target.min <= 1 && target.max >= 1 && !invalid;
  useEffect(() => {
    if (!canCompare || !active) return;
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
          throw new Error(result.error ?? "No pudimos comparar las variantes.");
        if (!controller.signal.aborted)
          setState({
            payload,
            costs: result.rows.map((r: { cost: string | null }) => r.cost),
            reference: result.rows.some(
              (r: { source?: string }) =>
                r.source === "reference" || r.source === "preparation",
            ),
          });
      } catch (error) {
        if (!controller.signal.aborted)
          setState({
            payload,
            reference: false,
            error: (error as Error).message,
          });
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [payload, canCompare, active]);
  if (!target) return null;
  const current = state?.payload === payload ? state : undefined;
  let offset = common.length;
  const totals = current?.costs
    ? variantTotals(
        [
          ...current.costs.slice(0, common.length),
          ...(incompleteCommon ? [null] : []),
        ],
        alternatives.map((o) => {
          const costs = current.costs!.slice(offset, offset + o.rows.length);
          offset += o.rows.length;
          return !o.instruction && !o.rows.length ? [null] : costs;
        }),
      )
    : undefined;
  return (
    <section
      className="space-y-5 rounded-xl border border-line bg-white p-5 sm:p-6"
      aria-label="Comparación de costos por variante"
    >
      <div>
        <h3 className="font-semibold text-brand">
          Costo del producto por variante
        </h3>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Cada total incluye la composición fija y las cantidades elegidas
          abajo. Esta comparación no cambia las selecciones por defecto de la
          venta.
        </p>
      </div>
      <label className="block text-sm font-medium" htmlFor={`${id}-group`}>
        Grupo a comparar
      </label>
      <select
        id={`${id}-group`}
        className="form-control"
        value={target.id}
        onChange={(e) => setGroupId(e.target.value)}
      >
        {groups.map((g) => (
          <option key={g.id} value={g.id}>
            {g.name}
          </option>
        ))}
      </select>
      {others.map((g) => (
        <fieldset key={g.id} className="space-y-3 border-t border-line pt-4">
          <legend className="px-1 text-sm font-semibold">{g.name}</legend>
          <p className="text-xs text-muted">
            Cantidad de elecciones en total: de {g.min} a {g.max}. Usá 0 para no
            incluir una opción.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            {g.options.map((o) => (
              <label
                key={o.id}
                className="flex items-center justify-between gap-4 text-sm"
              >
                <span>{o.name}</span>
                <Input
                  className="w-24 shrink-0"
                  aria-label={`${g.name}: cantidad de ${o.name}`}
                  type="number"
                  min={0}
                  max={Math.min(o.max, g.max)}
                  step={1}
                  value={countFor(g, o)}
                  onChange={(e) =>
                    setCounts((previous) => ({
                      ...previous,
                      [`${g.id}/${o.id}`]: Number(e.target.value),
                    }))
                  }
                />
              </label>
            ))}
          </div>
        </fieldset>
      ))}
      {!canCompare ? (
        <p role="status" className="text-sm text-amber-800">
          {invalid
            ? `Revisá las cantidades de ${invalid.name}: deben sumar entre ${invalid.min} y ${invalid.max}, respetando el máximo de cada opción.`
            : "Esta comparación muestra una elección por variante. Elegí un grupo que permita seleccionar una sola opción."}
        </p>
      ) : current?.error ? (
        <>
          <OperationAlert
            message={current.error}
            title="No pudimos comparar las variantes"
            tone="error"
          />
          <p className="text-sm text-muted">Comparación sin calcular.</p>
        </>
      ) : (
        <>
          <div className="overflow-x-auto" aria-live="polite">
            <table className="w-full text-left text-sm">
              <caption className="pb-3 text-left text-xs text-muted">
                Una elección de {target.name.toLowerCase()} por producto. Los
                recargos de venta no forman parte del costo.
              </caption>
              <thead>
                <tr className="border-b border-line">
                  <th className="py-3 pr-4 font-medium">Variante</th>
                  <th className="py-3 text-right font-medium">
                    Costo total estimado
                  </th>
                </tr>
              </thead>
              <tbody>
                {alternatives.map((o, i) => (
                  <tr
                    key={o.id}
                    className="border-b border-line/60 last:border-0"
                  >
                    <td className="py-4 pr-4">{o.name}</td>
                    <td className="py-4 text-right font-semibold tabular-nums">
                      {!totals
                        ? "Calculando…"
                        : totals[i] === null
                          ? "Costo pendiente"
                          : money(totals[i])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {current?.reference && (
            <p className="text-xs leading-relaxed text-muted">
              Incluye costos de referencia o de preparaciones estimadas cuando
              no hay stock. Los costos faltantes permanecen pendientes.
            </p>
          )}
        </>
      )}
    </section>
  );
}
