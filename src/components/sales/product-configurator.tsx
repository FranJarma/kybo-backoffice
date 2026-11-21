"use client";
import { useState, type Dispatch, type SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { money } from "@/components/inventory/shared";
import { cents, integer } from "@/modules/inventory/decimal";
import type { PublicConfiguration } from "@/modules/recipes/configuration";
import type { Selection } from "@/modules/modifiers/types";
import { catalogFinalPrice } from "@/modules/pricing/amounts";
import { ModifierOption } from "./modifier-option";
import { modifierAppearance } from "./modifier-presentation";

type ModifierGroup = PublicConfiguration["groups"][number];
type Choices = Record<string, number>;

function validateGroup(group: ModifierGroup, choices: Choices) {
  let count = 0;
  const problems: string[] = [];
  for (const option of group.options) {
    const selected = choices[option.id] ?? 0;
    count += selected;
    if (
      !Number.isInteger(selected) ||
      selected < 0 ||
      selected > option.maxCount
    )
      problems.push(`Revisá ${option.name}.`);
    if (selected && (!option.available || option.price == null))
      problems.push(
        `${option.name}: ${option.available ? "sin precio" : "no disponible"}.`,
      );
  }
  if (count < group.min || count > group.max)
    problems.push(`${group.name}: elegí entre ${group.min} y ${group.max}.`);
  return { count, problems };
}

function ModifierGroupControls({
  group,
  choices,
  count,
  vatRate,
  setChoices,
}: {
  group: ModifierGroup;
  choices: Choices;
  count: number;
  vatRate: PublicConfiguration["vatRate"];
  setChoices: Dispatch<SetStateAction<Choices>>;
}) {
  const chooseOnly = (optionId?: string) =>
    setChoices((current) => ({
      ...current,
      ...Object.fromEntries(
        group.options.map((option) => [
          option.id,
          Number(option.id === optionId),
        ]),
      ),
    }));
  const content = (
    <div className="space-y-3">
      <p className="text-xs text-muted">
        {group.max === 1
          ? group.min > 0
            ? "Elegí una opción"
            : "Podés elegir una opción"
          : group.min > 0
            ? `Entre ${group.min} y ${group.max} elecciones · ${count} seleccionadas`
            : `Hasta ${group.max} elecciones · ${count} seleccionadas`}
      </p>
      <div className="pos-modifier-options">
        {group.options.map((option) => {
          const selected = choices[option.id] ?? 0;
          const includedInRecipe = option.defaultCount > 0;
          let displayPrice = option.price;
          try {
            if (displayPrice !== null && vatRate)
              displayPrice = catalogFinalPrice(displayPrice, vatRate);
          } catch {
            displayPrice = null;
          }
          const available = option.available && option.maxCount > 0;
          const unavailable = !available || displayPrice == null;
          const description = !available
            ? "No disponible"
            : displayPrice == null
              ? "Revisar precio"
              : integer(displayPrice) === 0n
                ? includedInRecipe
                  ? null
                  : "Sin cargo"
                : `+ ${money(displayPrice)}`;
          return (
            <ModifierOption
              key={option.id}
              name={option.name}
              includedInRecipe={includedInRecipe}
              description={description}
              appearance={modifierAppearance(option.key)}
              unavailable={unavailable}
              controls={
                group.max === 1
                  ? {
                      type: "radio",
                      groupName: group.id,
                      required: group.min > 0,
                      checked: selected === 1,
                      onSelect: () => chooseOnly(option.id),
                    }
                  : {
                      type: "counter",
                      count: selected,
                      increaseDisabled:
                        unavailable ||
                        selected >= option.maxCount ||
                        count >= group.max,
                      onDecrease: () =>
                        setChoices((current) => ({
                          ...current,
                          [option.id]: Math.max(
                            0,
                            (current[option.id] ?? 0) - 1,
                          ),
                        })),
                      onIncrease: () =>
                        setChoices((current) => ({
                          ...current,
                          [option.id]: (current[option.id] ?? 0) + 1,
                        })),
                    }
              }
            />
          );
        })}
      </div>
      {group.min === 0 && (
        <Button
          type="button"
          className="min-h-12"
          variant="ghost"
          onClick={() => chooseOnly()}
        >
          Sin selección
        </Button>
      )}
    </div>
  );

  return group.min > 0 ? (
    <fieldset className="pos-modifier-group space-y-2">
      <legend className="text-base font-bold text-brand">
        {group.name} · obligatorio
      </legend>
      {content}
    </fieldset>
  ) : (
    <details className="pos-modifier-group border-t border-line">
      <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-3 text-sm font-bold text-brand">
        <span>{group.name} · opcional</span>
        <span className="text-xs font-normal text-muted">
          {count} seleccionadas · +
        </span>
      </summary>
      <div className="pb-4">{content}</div>
    </details>
  );
}

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
  const [choices, setChoices] = useState<Choices>(() =>
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
  const groups = config.groups.map((group) => ({
    group,
    ...validateGroup(group, choices),
  }));
  const problems = groups.flatMap((group) => group.problems);
  for (const g of config.groups) {
    for (const o of g.options) {
      const n = choices[o.id] ?? 0;
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
  return (
    <div className="pos-product-configurator">
      <div className="pos-modifier-groups">
        {groups
          .sort((a, b) => Number(b.group.min > 0) - Number(a.group.min > 0))
          .map(({ group, count }) => (
            <ModifierGroupControls
              key={group.id}
              group={group}
              choices={choices}
              count={count}
              vatRate={config.vatRate}
              setChoices={setChoices}
            />
          ))}
      </div>
      <div className="pos-modifier-footer">
        {problems.length > 0 && (
          <p
            role="status"
            className="pos-modifier-status text-sm text-amber-800"
          >
            {problems[0]}
          </p>
        )}
        <strong className="text-xl text-brand">
          {amount === null ? "Sin precio" : money(cents(amount))}
        </strong>
        <div className="pos-modifier-actions">
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
