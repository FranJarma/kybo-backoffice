"use client";
import { useState, useRef } from "react";
import { Input } from "@/components/ui/input";
import { money, quantity } from "@/components/inventory/shared";
import { writeJson } from "@/components/modifiers/manager";
import {
  defaultSelections,
  resolveComposition,
} from "@/modules/recipes/composition";
import type { RecipeDetail } from "@/modules/recipes/types";
import type { CompositionCost, Selection } from "@/modules/modifiers/types";
export function CostSimulator({ recipe }: { recipe: RecipeDetail }) {
  const config = recipe.configuration!;
  const [selections, setSelections] = useState<Selection[]>(() =>
    defaultSelections(config),
  );
  const [cost, setCost] = useState<CompositionCost | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const seq = useRef(0);
  let composition;
  try {
    composition = resolveComposition(config, selections);
  } catch {}
  async function select(id: string, count: number) {
    const next = [
      ...selections.filter((s) => s.recipeModifierOptionId !== id),
      { recipeModifierOptionId: id, count },
    ];
    setSelections(next);
    setCost(null);
    setError("");
    const n = ++seq.current;
    setBusy(true);
    try {
      const r = await writeJson<CompositionCost>(
        `/api/recipes/${recipe.id}/cost`,
        { revision: recipe.revision, modifiers: next },
      );
      if (seq.current === n) setCost(r);
    } catch (e) {
      if (seq.current === n) setError((e as Error).message);
    } finally {
      if (seq.current === n) setBusy(false);
    }
  }
  return (
    <section className="mb-5 rounded-xl border border-blue-100 bg-blue-50/30 p-4 space-y-4">
      <h3 className="font-bold text-brand">Comparar combinaciones</h3>
      {config.groups.map((g) => (
        <fieldset key={g.id} className="space-y-2">
          <legend className="text-sm font-semibold mb-2">
            {g.name} · {g.min} a {g.max}
          </legend>
          {g.options
            .filter((o) => o.enabled)
            .map((o) => (
              <label
                key={o.id}
                className="flex justify-between items-center gap-3 text-sm"
              >
                <span>{o.name}</span>
                <Input
                  aria-label={`Comparar ${o.name}`}
                  className="w-20 bg-white"
                  type="number"
                  min={0}
                  max={o.maxCount}
                  value={
                    selections.find((s) => s.recipeModifierOptionId === o.id)
                      ?.count ?? 0
                  }
                  onChange={(e) => select(o.id, Number(e.target.value))}
                />
              </label>
            ))}
        </fieldset>
      ))}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="border-t border-blue-100 pt-3">
        <p className="text-sm">
          Costo de reposición:{" "}
          <strong>
            {error
              ? "Revisar selección"
              : busy
                ? "Calculando…"
                : cost
                  ? money(cost.totalCost, 6)
                  : money(recipe.cost.unitCost, 6)}
          </strong>
        </p>
        {cost?.totalCost === null && (
          <p className="text-xs text-amber-800">
            Subtotal conocido: {money(cost.knownSubtotal, 6)}. Falta:{" "}
            {cost.missing.join(", ")}.
          </p>
        )}
      </div>
      {composition && (
        <div className="space-y-1">
          {composition.components.map((c) => (
            <p key={c.itemId} className="text-xs text-muted">
              {c.name}: {quantity(c.quantity, c.baseUnit)}
            </p>
          ))}
        </div>
      )}
      <p className="text-xs text-muted">
        Simular no registra una venta ni modifica stock.
      </p>
    </section>
  );
}
