"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Minus, Plus } from "lucide-react";
import { money } from "@/components/inventory/shared";
import { cents, integer } from "@/modules/inventory/decimal";
import type { PublicConfiguration } from "@/modules/recipes/configuration";
import type { Selection } from "@/modules/modifiers/types";
import { catalogFinalPrice } from "@/modules/pricing/amounts";
export function ProductConfigurator({
  config,
  initialSelection,
  confirmLabel = "Agregar al pedido",
  onConfirm,
  onCancel,
}: {
  config: PublicConfiguration;
  initialSelection?: Selection[];
  confirmLabel?: string;
  onConfirm: (data: {
    expectedRecipeVersionId: string | null;
    modifiers: Selection[];
    expectedPrice: string;
    modifierLabels: string[];
    selectionSurcharge?: string;
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
  const finalBase =
    config.catalogBasePrice === undefined
      ? config.basePrice
      : config.catalogBasePrice;
  let amount = finalBase == null ? null : integer(finalBase);
  let surcharge = 0n;
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
      ) {
        const extra = integer(o.price) * BigInt(n || 0);
        amount += extra;
        surcharge += extra;
      }
    }
    if (count < g.min || count > g.max)
      problems.push(`${g.name}: elegí entre ${g.min} y ${g.max}.`);
  }
  if (amount !== null && config.vatRate !== undefined) {
    try {
      const final = catalogFinalPrice(cents(amount), config.vatRate);
      amount = final === null ? null : integer(final);
    } catch {
      amount = null;
      problems.push(
        "El precio configurado supera el máximo permitido. Revisá sus adicionales.",
      );
    }
  }
  if (amount === null)
    problems.push("El producto no tiene precio en este canal.");
  const renderGroup = (g: PublicConfiguration["groups"][number]) => {
    const count = g.options.reduce((n, o) => n + (choices[o.id] ?? 0), 0);
    return (
      <div className="space-y-3">
        <p className="text-xs text-muted">
          {g.max === 1
            ? "Elegí una opción"
            : `Hasta ${g.max} elecciones · ${count} seleccionadas`}
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {g.options.map((o) => {
            const selected = choices[o.id] ?? 0;
            let displayPrice = o.price;
            try {
              if (displayPrice !== null && config.vatRate)
                displayPrice = catalogFinalPrice(displayPrice, config.vatRate);
            } catch {
              displayPrice = null;
            }
            const unavailable = !o.available || displayPrice == null;
            const description = !o.available
              ? "No disponible"
              : displayPrice == null
                ? "Revisar precio"
                : integer(displayPrice) === 0n
                  ? "Incluido"
                  : `+ ${money(displayPrice)}`;
            const text = (
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{o.name}</span>
                <span className="mt-1 block text-xs text-muted">
                  {description}
                </span>
              </span>
            );
            const style = `flex min-h-14 items-center justify-between gap-3 rounded-lg border p-3 ${selected > 0 ? "border-blue bg-blue/5" : "border-line"} ${unavailable ? "opacity-50" : ""}`;
            return g.max === 1 ? (
              <label key={o.id} className={`${style} cursor-pointer`}>
                <span className="flex min-w-0 items-center gap-3">
                  <input
                    className="size-5 shrink-0 accent-blue"
                    type="radio"
                    name={g.id}
                    checked={selected === 1}
                    disabled={unavailable}
                    onChange={() =>
                      setChoices((current) => ({
                        ...current,
                        ...Object.fromEntries(
                          g.options.map((x) => [x.id, x.id === o.id ? 1 : 0]),
                        ),
                      }))
                    }
                  />
                  {text}
                </span>
              </label>
            ) : (
              <div key={o.id} className={style}>
                {text}
                <div className="flex shrink-0 items-center rounded-lg border border-line bg-white">
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="min-h-12 min-w-12"
                    aria-label={`Disminuir ${o.name}`}
                    disabled={selected <= 0}
                    onClick={() =>
                      setChoices((current) => ({
                        ...current,
                        [o.id]: Math.max(0, (current[o.id] ?? 0) - 1),
                      }))
                    }
                  >
                    <Minus size={18} />
                  </Button>
                  <output
                    aria-label={`Cantidad ${o.name}`}
                    className="min-w-6 text-center font-semibold tabular-nums"
                  >
                    {selected}
                  </output>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="min-h-12 min-w-12"
                    aria-label={`Aumentar ${o.name}`}
                    disabled={
                      unavailable || selected >= o.maxCount || count >= g.max
                    }
                    onClick={() =>
                      setChoices((current) => ({
                        ...current,
                        [o.id]: (current[o.id] ?? 0) + 1,
                      }))
                    }
                  >
                    <Plus size={18} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        {g.min === 0 && (
          <Button
            type="button"
            className="min-h-12"
            variant="ghost"
            onClick={() =>
              setChoices((current) => ({
                ...current,
                ...Object.fromEntries(g.options.map((o) => [o.id, 0])),
              }))
            }
          >
            Sin selección
          </Button>
        )}
      </div>
    );
  };
  return (
    <div className="space-y-4">
      {[...config.groups]
        .sort((a, b) => Number(b.min > 0) - Number(a.min > 0))
        .map((g) =>
          g.min > 0 ? (
            <fieldset key={g.id} className="rounded-xl border border-line p-4">
              <legend className="px-2 text-sm font-bold text-brand">
                {g.name} · obligatorio
              </legend>
              {renderGroup(g)}
            </fieldset>
          ) : (
            <details key={g.id} className="rounded-xl border border-line px-4">
              <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 text-sm font-bold text-brand">
                <span>{g.name} · opcional</span>
                <span className="text-xs font-normal text-muted">
                  {g.options.reduce((n, o) => n + (choices[o.id] ?? 0), 0)}{" "}
                  seleccionadas · +
                </span>
              </summary>
              <div className="pb-4">{renderGroup(g)}</div>
            </details>
          ),
        )}
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
          <Button
            type="button"
            className="min-h-12"
            variant="outline"
            onClick={onCancel}
          >
            Cancelar
          </Button>
          <Button
            type="button"
            className="min-h-12"
            disabled={problems.length > 0}
            onClick={() =>
              onConfirm({
                expectedRecipeVersionId: config.recipeVersionId,
                expectedPrice: cents(amount!),
                selectionSurcharge: cents(surcharge),
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
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
