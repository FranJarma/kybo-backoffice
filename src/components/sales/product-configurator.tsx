"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { money } from "@/components/inventory/shared";
import { cents, integer } from "@/modules/inventory/decimal";
import type { PublicConfiguration } from "@/modules/recipes/configuration";
import type { Selection } from "@/modules/modifiers/types";
export function ProductConfigurator({
  config,
  initialSelection,
  onConfirm,
  onCancel,
}: {
  config: PublicConfiguration;
  initialSelection?: Selection[];
  onConfirm: (data: {
    expectedRecipeVersionId: string | null;
    modifiers: Selection[];
    expectedPrice: string;
    modifierLabels: string[];
  }) => void;
  onCancel: () => void;
}) {
  const [choices, setChoices] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      config.groups.flatMap((g) =>
        g.options.map((o) => [
          o.id,
          initialSelection
            ? (initialSelection.find((s) => s.recipeModifierOptionId === o.id)
                ?.count ?? 0)
            : o.defaultCount,
        ]),
      ),
    ),
  );
  let amount = config.basePrice == null ? null : integer(config.basePrice);
  const problems: string[] = [];
  for (const g of config.groups) {
    let count = 0;
    for (const o of g.options) {
      const n = choices[o.id] ?? 0;
      count += n;
      if (!Number.isInteger(n) || n < 0 || n > o.maxCount)
        problems.push(`Revisá ${o.name}.`);
      if (n && (!o.available || o.price == null))
        problems.push(
          `${o.name}: ${o.available ? "sin precio" : "no disponible"}.`,
        );
      if (
        amount !== null &&
        o.price != null &&
        Number.isSafeInteger(n) &&
        n >= 0
      )
        amount += integer(o.price) * BigInt(n || 0);
    }
    if (count < g.min || count > g.max)
      problems.push(`${g.name}: elegí entre ${g.min} y ${g.max}.`);
  }
  if (amount === null)
    problems.push("El producto no tiene precio en este canal.");
  return (
    <div className="space-y-5">
      {config.groups.map((g) => (
        <fieldset key={g.id} className="rounded-xl border border-line p-4">
          <legend className="px-2 text-sm font-bold text-brand">
            {g.name} {g.min > 0 ? "· obligatorio" : "· opcional"}
          </legend>
          <p className="mb-3 text-xs text-muted">
            {g.max === 1 ? "Elegí una opción" : `Hasta ${g.max} elecciones`}
          </p>
          <div className="space-y-2">
            {g.options.map((o) => (
              <label
                key={o.id}
                className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-line px-3 py-2"
              >
                <span className="flex items-center gap-3">
                  {g.max === 1 ? (
                    <input
                      type="radio"
                      name={g.id}
                      checked={choices[o.id] === 1}
                      disabled={!o.available || o.price == null}
                      onChange={() =>
                        setChoices({
                          ...choices,
                          ...Object.fromEntries(
                            g.options.map((x) => [x.id, x.id === o.id ? 1 : 0]),
                          ),
                        })
                      }
                    />
                  ) : (
                    <Input
                      className="w-16"
                      type="number"
                      min={0}
                      max={o.maxCount}
                      aria-label={`Cantidad ${o.name}`}
                      value={choices[o.id] ?? 0}
                      disabled={!o.available || o.price == null}
                      onChange={(e) =>
                        setChoices({
                          ...choices,
                          [o.id]: Number(e.target.value),
                        })
                      }
                    />
                  )}
                  <span className="text-sm font-semibold">{o.name}</span>
                </span>
                <span className="text-xs text-muted">
                  {!o.available
                    ? "No disponible"
                    : o.price == null
                      ? "Sin precio"
                      : integer(o.price) === 0n
                        ? "Incluido"
                        : `+ ${money(o.price)}`}
                </span>
              </label>
            ))}
          </div>
          {g.min === 0 && (
            <Button
              className="mt-2"
              variant="ghost"
              onClick={() =>
                setChoices({
                  ...choices,
                  ...Object.fromEntries(g.options.map((o) => [o.id, 0])),
                })
              }
            >
              Sin selección
            </Button>
          )}
        </fieldset>
      ))}
      {problems.length > 0 && (
        <p role="status" className="text-sm text-amber-800">
          {problems[0]}
        </p>
      )}
      <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-line bg-white py-4">
        <strong className="text-xl text-brand">
          {amount === null ? "Sin precio" : money(cents(amount))}
        </strong>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            disabled={problems.length > 0}
            onClick={() =>
              onConfirm({
                expectedRecipeVersionId: config.recipeVersionId,
                expectedPrice: cents(amount!),
                modifiers: Object.entries(choices)
                  .filter(([, count]) => count > 0)
                  .map(([recipeModifierOptionId, count]) => ({
                    recipeModifierOptionId,
                    count,
                  })),
                modifierLabels: config.groups.flatMap((g) =>
                  g.options
                    .filter((o) => choices[o.id] > 0)
                    .map((o) => `${choices[o.id]} × ${o.name}`),
                ),
              })
            }
          >
            Agregar al pedido
          </Button>
        </div>
      </div>
    </div>
  );
}
