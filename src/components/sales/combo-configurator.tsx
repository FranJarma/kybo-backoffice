"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { getJson, money } from "@/components/inventory/shared";
import { ProductConfigurator } from "./product-configurator";
import { cents, integer } from "@/modules/inventory/decimal";
import type { ComboDefinition } from "@/modules/combos/service";
import type { PublicConfiguration } from "@/modules/recipes/configuration";
import type { LineInput } from "@/modules/sales/validation";
import type { SaleChannel } from "@/modules/sales/types";
export type ComboSaleConfiguration = {
  definition: ComboDefinition;
  basePrice: string;
  unavailableProductIds?: string[];
};
type Choice = NonNullable<LineInput["comboChoices"]>[number];
type Selected = { choice: Choice; extra: string; labels: string[] };
export function ComboConfigurator({
  config,
  channel,
  initialChoices,
  onConfirm,
  onCancel,
}: {
  config: ComboSaleConfiguration;
  channel: SaleChannel;
  initialChoices?: Choice[];
  onConfirm: (data: {
    expectedComboVersionId: string;
    comboChoices: Choice[];
    expectedPrice: string;
    modifierLabels: string[];
  }) => void;
  onCancel: () => void;
}) {
  const [error, setError] = useState("");
  const cache = useRef(new Map<string, Promise<PublicConfiguration>>());
  const loadConfiguration = useCallback(
    (productId: string) => {
      const key = `${channel}:${productId}`;
      const cached = cache.current.get(key);
      if (cached) return cached;
      const request = getJson<PublicConfiguration>(
        `/api/sales/products/${productId}/configuration?channel=${channel}`,
      ).catch((error) => {
        cache.current.delete(key);
        throw error;
      });
      cache.current.set(key, request);
      return request;
    },
    [channel],
  );
  const [selected, setSelected] = useState<Record<string, Selected>>({});
  const [restoring, setRestoring] = useState(!!initialChoices?.length);
  useEffect(() => {
    if (!initialChoices?.length) return;
    let live = true;
    Promise.all(
      config.definition.groups.map(
        async (g): Promise<[string, Selected] | null> => {
          const choice = initialChoices.find((c) => c.groupId === g.id);
          const option = g.options.find(
            (o) => o.id === choice?.optionId && !o.archived,
          );
          if (!choice || !option) return null;
          const c = await loadConfiguration(option.productId);
          if (
            c.fulfillmentVersionId !== choice.expectedFulfillmentVersionId ||
            c.recipeVersionId !== choice.expectedRecipeVersionId
          )
            return null;
          let extra = 0n;
          const labels: string[] = [];
          for (const m of choice.modifiers ?? []) {
            const o = c.groups
              .flatMap((g) => g.options)
              .find((o) => o.id === m.recipeModifierOptionId);
            if (!o || !o.available || o.price == null) return null;
            extra += integer(o.price) * BigInt(m.count);
            if (m.count) labels.push(`${m.count} × ${o.name}`);
          }
          return [g.id, { choice, extra: cents(extra), labels }];
        },
      ),
    )
      .then((entries) => {
        if (live)
          setSelected(
            Object.fromEntries(
              entries.filter((e): e is [string, Selected] => e !== null),
            ),
          );
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setRestoring(false);
      });
    return () => {
      live = false;
    };
  }, [initialChoices, config.definition, loadConfiguration]);
  const [editing, setEditing] = useState<{
    groupId: string;
    optionId: string;
    config: PublicConfiguration;
  } | null>(null);
  const [pending, setPending] = useState<{
    groupId: string;
    optionId: string;
    productId: string;
  } | null>(null);
  useEffect(() => {
    if (!pending) return;
    let live = true;
    loadConfiguration(pending.productId)
      .then((c) => {
        if (!live) return;
        if (!c.fulfillmentVersionId)
          throw Error(
            "Este producto no tiene una modalidad de entrega publicada.",
          );
        setEditing({ ...pending, config: { ...c, basePrice: "0.00" } });
        setPending(null);
      })
      .catch((e) => {
        if (live) {
          setError(e.message);
          setPending(null);
        }
      });
    return () => {
      live = false;
    };
  }, [pending, loadConfiguration]);
  const total =
    integer(config.basePrice) +
    config.definition.groups.reduce((sum, g) => {
      const s = selected[g.id];
      if (!s) return sum;
      const o = g.options.find((o) => o.id === s.choice.optionId)!;
      return (
        sum + (integer(o[channel]) + integer(s.extra)) * BigInt(g.quantity)
      );
    }, 0n);
  return (
    <div className="space-y-6">
      <p className="text-sm text-muted">
        Elegí un producto por grupo y configurá sus opciones. No se suma el
        precio individual de los productos.
      </p>
      {config.definition.groups.map((g) => (
        <section
          className="space-y-3 rounded-xl border border-line p-5"
          key={g.id}
        >
          <h3 className="font-semibold">
            {g.name} · {g.quantity} {g.quantity === 1 ? "unidad" : "unidades"}
          </h3>
          <div className="flex flex-wrap gap-2">
            {g.options.map((o) => (
              <Button
                key={o.id}
                variant={
                  selected[g.id]?.choice.optionId === o.id
                    ? "secondary"
                    : "outline"
                }
                disabled={
                  o.archived ||
                  config.unavailableProductIds?.includes(o.productId) ||
                  !!pending ||
                  restoring
                }
                onClick={() => {
                  setError("");

                  setEditing(null);
                  setPending({
                    groupId: g.id,
                    optionId: o.id,
                    productId: o.productId,
                  });
                }}
              >
                {o.name}
                {integer(o[channel]) > 0n ? ` (+${money(o[channel])})` : ""}
              </Button>
            ))}
          </div>
          {selected[g.id] && (
            <p className="text-sm text-muted">
              {selected[g.id].labels.join(" · ") ||
                "Incluido, sin modificaciones"}
            </p>
          )}
          {editing?.groupId === g.id && (
            <ProductConfigurator
              key={editing.optionId}
              config={editing.config}
              confirmLabel="Confirmar opción"
              initialSelection={
                selected[g.id]?.choice.optionId === editing.optionId
                  ? selected[g.id].choice.modifiers
                  : undefined
              }
              onCancel={() => setEditing(null)}
              onConfirm={(data) => {
                setSelected((all) => ({
                  ...all,
                  [g.id]: {
                    choice: {
                      groupId: g.id,
                      optionId: editing.optionId,
                      expectedFulfillmentVersionId:
                        editing.config.fulfillmentVersionId!,
                      expectedRecipeVersionId: data.expectedRecipeVersionId,
                      modifiers: data.modifiers,
                    },
                    extra: data.expectedPrice,
                    labels: data.modifierLabels,
                  },
                }));
                setEditing(null);
              }}
            />
          )}
        </section>
      ))}
      {(pending || restoring) && <p role="status">Cargando opciones…</p>}
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-line pt-5">
        <strong>{money(cents(total))}</strong>
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <Button
          disabled={
            restoring ||
            !!pending ||
            !!editing ||
            config.definition.groups.some((g) => !selected[g.id])
          }
          onClick={() =>
            onConfirm({
              expectedComboVersionId: config.definition.id,
              comboChoices: config.definition.groups.map(
                (g) => selected[g.id].choice,
              ),
              expectedPrice: cents(total),
              modifierLabels: config.definition.groups.flatMap((g) => {
                const s = selected[g.id],
                  o = g.options.find((o) => o.id === s.choice.optionId)!;
                return [`${g.quantity} × ${o.name} (incluido)`, ...s.labels];
              }),
            })
          }
        >
          Agregar combo
        </Button>
      </div>
    </div>
  );
}
