"use client";
import { CostPreview } from "./cost-preview";
import { Control as Field } from "@/components/sales/shared";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchSelect, getJson } from "@/components/inventory/shared";
import { inputDecimal } from "./shared";
import {
  ComponentFields,
  type ComponentDraft,
  type GroupDetail,
} from "@/components/modifiers/manager";
import { diffGroupVersions } from "@/modules/modifiers/diff";
import type { ConversionDraft } from "@/modules/recipes/conversion";
import type { RecipeDetail, RecipeInput } from "@/modules/recipes/types";
type OptionDraft = {
  optionId: string;
  key: string;
  name: string;
  kind: string;
  enabled: boolean;
  defaultCount: number;
  maxCount: number;
  mode: "inherit" | "override";
  components: ComponentDraft[];
  inherited?: ComponentDraft[];
  prices: { counter: string; pedidosya: string; ubereats: string };
};
type GroupDraft = {
  draft?: {
    requestId: string;
    name: string;
    options: {
      key: string;
      name: string;
      kind: string;
      components: ComponentDraft[];
    }[];
  };
  changes?: string[];
  groupId: string;
  groupVersionId: string;
  name: string;
  min: number;
  max: number;
  factor: string;
  options: OptionDraft[];
};
export function ModifierRecipeEditor({
  initial,
  onSave,
  onCancel,
  disabled,
  error,
}: {
  initial?: RecipeDetail;
  onSave: (input: RecipeInput) => void;
  onCancel: () => void;
  disabled: boolean;
  error: string;
}) {
  const [targetId, setTargetId] = useState(initial?.targetId ?? "");
  const [fixed, setFixed] = useState<ComponentDraft[]>(
    () =>
      initial?.lines
        .filter((l) => !l.optional && l.options.length === 1)
        .map((l) => ({
          ...l.options[0],
          quantity: inputDecimal(l.options[0].quantity),
          wastePercent: inputDecimal(l.options[0].wastePercent ?? "0.00"),
        })) ?? [],
  );
  const [groups, setGroups] = useState<GroupDraft[]>(
    () =>
      initial?.configuration?.groups.map((g) => ({
        groupId: g.groupId ?? "",
        groupVersionId: g.groupVersionId,
        name: g.name,
        min: g.min,
        max: g.max,
        factor: inputDecimal(g.factor),
        options: g.options.map((o) => ({
          optionId: o.optionId!,
          key: o.key,
          name: o.name,
          kind: o.kind,
          enabled: o.enabled,
          defaultCount: o.defaultCount,
          maxCount: o.maxCount,
          mode: o.mode,
          inherited:
            o.mode === "inherit"
              ? o.components.map((c) => ({
                  ...c,
                  quantity: inputDecimal(c.quantity),
                  wastePercent: inputDecimal(c.wastePercent ?? "0.00"),
                }))
              : [],
          components:
            o.mode === "override"
              ? o.components.map((c) => ({
                  ...c,
                  quantity: inputDecimal(c.quantity),
                  wastePercent: inputDecimal(c.wastePercent ?? "0.00"),
                }))
              : [],
          prices: {
            counter:
              o.prices.counter == null ? "" : inputDecimal(o.prices.counter),
            pedidosya:
              o.prices.pedidosya == null
                ? ""
                : inputDecimal(o.prices.pedidosya),
            ubereats:
              o.prices.ubereats == null ? "" : inputDecimal(o.prices.ubereats),
          },
        })),
      })) ?? [],
  );
  const [available, setAvailable] = useState<
      { id: string; name: string; archivedAt: string | null }[]
    >([]),
    [chosen, setChosen] = useState(""),
    [localError, setLocalError] = useState(""),
    [busy, setBusy] = useState(false);
  const [legacyReviewed, setLegacyReviewed] = useState(
    initial?.compositionModel !== "legacy",
  );
  useEffect(() => {
    let live = true;
    getJson<typeof available>("/api/modifier-groups")
      .then((x) => {
        if (live) setAvailable(x);
      })
      .catch((e) => {
        if (live) setLocalError(e.message);
      });
    return () => {
      live = false;
    };
  }, []);
  function draft(g: GroupDetail): GroupDraft {
    return {
      groupId: g.id,
      groupVersionId: g.versionId,
      name: g.name,
      min: 1,
      max: 1,
      factor: "1",
      options: g.options.map((o, i) => ({
        optionId: o.id,
        key: o.key,
        name: o.name,
        kind: o.kind,
        enabled: true,
        defaultCount: i === 0 ? 1 : 0,
        maxCount: 1,
        mode: "inherit",
        inherited: o.components.map((c) => ({
          ...c,
          quantity: inputDecimal(c.quantity),
          wastePercent: inputDecimal(c.wastePercent ?? "0.00"),
        })),
        components: [],
        prices: { counter: "", pedidosya: "", ubereats: "" },
      })),
    };
  }
  const update = (i: number, patch: Partial<GroupDraft>) =>
    setGroups(groups.map((g, j) => (i === j ? { ...g, ...patch } : g)));
  const option = (i: number, j: number, patch: Partial<OptionDraft>) =>
    update(i, {
      options: groups[i].options.map((o, k) =>
        j === k ? { ...o, ...patch } : o,
      ),
    });
  async function convert() {
    if (!initial) return;
    setBusy(true);
    setLocalError("");
    try {
      const proposed = await getJson<ConversionDraft>(
        `/api/recipes/${initial.id}/conversion?revision=${initial.revision}`,
      );
      setFixed(
        proposed.fixed.map((l) => ({
          ...l.options[0],
          quantity: inputDecimal(l.options[0].quantity),
          wastePercent: inputDecimal(l.options[0].wastePercent ?? "0.00"),
        })),
      );
      setGroups(
        proposed.groups.map((g, i) => ({
          groupId: "",
          groupVersionId: "",
          name: g.name,
          min: g.min,
          max: g.max,
          factor: "1",
          draft: {
            requestId: crypto.randomUUID(),
            name: `${initial.name} · elección ${i + 1}`,
            options: g.options.map((o) => ({
              key: o.key,
              name: o.name,
              kind: o.kind,
              components: o.components.map((c) => ({
                ...c,
                quantity: inputDecimal(c.quantity),
                wastePercent: inputDecimal(c.wastePercent ?? "0.00"),
              })),
            })),
          },
          options: g.options.map((o) => ({
            optionId: "",
            key: o.key,
            name: o.name,
            kind: o.kind,
            enabled: true,
            defaultCount: o.defaultCount,
            maxCount: o.maxCount,
            mode: "inherit",
            components: [],
            inherited: o.components.map((c) => ({
              ...c,
              quantity: inputDecimal(c.quantity),
              wastePercent: inputDecimal(c.wastePercent ?? "0.00"),
            })),
            prices: { counter: "", pedidosya: "", ubereats: "" },
          })),
        })),
      );
      setLegacyReviewed(true);
    } catch (e) {
      setLocalError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        if (!legacyReviewed) return;
        onSave({
          requestId: crypto.randomUUID(),
          id: initial?.id,
          revision: initial?.revision,
          kind: "product",
          targetId,
          targetUnit: "unit",
          yieldQuantity: "1",
          notes: initial?.notes,
          compositionModel: "configurable",
          lines: fixed.map((c) => ({
            optional: false,
            options: [
              {
                itemId: c.itemId,
                quantity: c.quantity,
                wastePercent: c.wastePercent,
                baseUnit: c.baseUnit,
              },
            ],
          })),
          groups: groups.map((g) => ({
            groupVersionId: g.groupVersionId || undefined,
            draft: g.draft
              ? {
                  ...g.draft,
                  name: g.name,
                  options: g.draft.options.map((o) => ({
                    ...o,
                    components: o.components.map(
                      ({ itemId, quantity, wastePercent, baseUnit }) => ({
                        itemId,
                        quantity,
                        wastePercent,
                        baseUnit,
                      }),
                    ),
                  })),
                }
              : undefined,
            name: g.name,
            min: g.min,
            max: g.max,
            factor: g.factor,
            options: g.options.map((o) => ({
              optionId: o.optionId || undefined,
              optionKey: g.draft ? o.key : undefined,
              enabled: o.enabled,
              defaultCount: o.defaultCount,
              maxCount: o.maxCount,
              mode: o.mode,
              components: o.components.map(
                ({ itemId, quantity, wastePercent, baseUnit }) => ({
                  itemId,
                  quantity,
                  wastePercent,
                  baseUnit,
                }),
              ),
              prices: o.prices,
            })),
          })),
        } as RecipeInput);
      }}
    >
      <CostPreview
        rows={[
          ...fixed.map((c) => ({
            itemId: c.itemId,
            name: c.name,
            itemClass: c.itemClass,
            baseUnit: c.baseUnit,
            quantity: c.quantity,
            wastePercent: c.wastePercent,
          })),
          ...groups.flatMap((g) =>
            g.options
              .filter((o) => o.enabled)
              .flatMap((o) =>
                (o.mode === "inherit" ? (o.inherited ?? []) : o.components).map(
                  (c) => ({
                    itemId: c.itemId,
                    name: c.name || o.name,
                    itemClass: c.itemClass,
                    baseUnit: c.baseUnit,
                    quantity: c.quantity,
                    wastePercent: c.wastePercent,
                    multiplier: o.mode === "inherit" ? g.factor : "1",
                    count: o.defaultCount > 0 ? o.defaultCount : 1,
                    include: o.defaultCount > 0,
                  }),
                ),
              ),
          ),
        ]}
      />
      <fieldset disabled={disabled || busy} className="space-y-8">
        {!initial && (
          <SearchSelect
            entity="products"
            label="Producto"
            value={targetId}
            required
            onChange={setTargetId}
          />
        )}
        {!legacyReviewed && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 space-y-3">
            <p className="text-sm">
              Esta receta conserva alternativas anteriores. Preparar la
              conversión crea grupos reutilizables con las mismas cantidades;
              después revisás sus nombres, reglas y recargos antes de publicar
              una nueva receta.
            </p>
            <Button type="button" variant="outline" onClick={convert}>
              Preparar conversión
            </Button>
          </div>
        )}
        <section className="rounded-xl border border-line p-4">
          <h3 className="mb-3 font-bold text-brand">Composición fija</h3>
          <p className="mb-4 text-xs text-muted">
            Ingredientes y descartables que siempre lleva el producto. Ambos
            suman costo y consumo de stock. Las alternativas se agregan en
            grupos.
          </p>
          <ComponentFields value={fixed} onChange={setFixed} />
        </section>
        {groups.map((g, i) => (
          <section
            key={g.groupVersionId || g.draft?.requestId}
            className="rounded-xl border border-line bg-surface/30 p-5 space-y-6 sm:p-6"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-bold text-brand">{g.name}</h3>
              {g.groupId && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={async () => {
                    setBusy(true);
                    setLocalError("");
                    try {
                      const latest = await getJson<GroupDetail>(
                        `/api/modifier-groups/${g.groupId}`,
                      );
                      if (latest.versionId === g.groupVersionId) {
                        setLocalError("Este grupo ya usa la última versión.");
                        return;
                      }
                      const previous = await getJson<GroupDetail>(
                        `/api/modifier-groups/${g.groupId}?version=${g.groupVersionId}`,
                      );
                      const changes = diffGroupVersions(previous, latest);
                      const next = draft(latest);
                      update(i, {
                        groupVersionId: next.groupVersionId,
                        changes,
                        options: next.options.map((o) => {
                          const old = g.options.find((x) => x.key === o.key);
                          return old
                            ? {
                                ...old,
                                optionId: o.optionId,
                                inherited: o.inherited,
                                name: o.name,
                                kind: o.kind,
                                mode:
                                  o.kind === "instruction"
                                    ? "inherit"
                                    : old.mode,
                                components:
                                  o.kind === "instruction"
                                    ? []
                                    : old.components,
                              }
                            : { ...o, defaultCount: 0 };
                        }),
                      });
                      setLocalError(
                        "Versión actualizada en el borrador. Revisá opciones agregadas o retiradas, cantidades y recargos antes de publicar.",
                      );
                    } catch (e) {
                      setLocalError((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Revisar nueva versión
                </Button>
              )}

              <Button
                type="button"
                variant="ghost"
                onClick={() => setGroups(groups.filter((_, j) => j !== i))}
              >
                Quitar grupo
              </Button>
            </div>
            {g.changes && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
                <strong>Cambios respecto de la versión anterior</strong>
                <ul className="mt-2 list-disc pl-5">
                  {g.changes.map((change, k) => (
                    <li key={k}>{change}</li>
                  ))}
                </ul>
                <p className="mt-2">
                  Los recargos y las composiciones propias se conservan cuando
                  coincide la opción. Revisalos antes de publicar.
                </p>
              </div>
            )}
            <Field label="Nombre visible del grupo">
              <Input
                value={g.name}
                onChange={(e) => update(i, { name: e.target.value })}
              />
            </Field>
            <div className="grid gap-5 sm:grid-cols-3">
              <Field label="Mínimo">
                <Input
                  type="number"
                  min={0}
                  value={g.min}
                  onChange={(e) => update(i, { min: Number(e.target.value) })}
                />
              </Field>
              <Field label="Máximo">
                <Input
                  type="number"
                  min={0}
                  value={g.max}
                  onChange={(e) => update(i, { max: Number(e.target.value) })}
                />
              </Field>
              <Field label="Factor de porción">
                <Input
                  inputMode="decimal"
                  value={g.factor}
                  onChange={(e) => update(i, { factor: e.target.value })}
                />
              </Field>
            </div>
            {g.options.map((o, j) => (
              <div
                key={o.key}
                className="rounded-lg bg-white border border-line p-5 space-y-6"
              >
                <label className="flex items-center gap-2 font-semibold text-sm">
                  <input
                    type="checkbox"
                    checked={o.enabled}
                    onChange={(e) =>
                      option(i, j, {
                        enabled: e.target.checked,
                        defaultCount: e.target.checked ? o.defaultCount : 0,
                      })
                    }
                  />
                  {o.name}
                </label>
                <div className="grid gap-5 sm:grid-cols-2">
                  <Field label="Cantidad inicial">
                    <Input
                      type="number"
                      min={0}
                      value={o.defaultCount}
                      onChange={(e) =>
                        option(i, j, { defaultCount: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Máximo por opción">
                    <Input
                      type="number"
                      min={0}
                      value={o.maxCount}
                      onChange={(e) =>
                        option(i, j, { maxCount: Number(e.target.value) })
                      }
                    />
                  </Field>
                </div>
                <div className="grid gap-5 sm:grid-cols-3">
                  {(["counter", "pedidosya", "ubereats"] as const).map((c) => (
                    <Field
                      key={c}
                      label={`Recargo ${c === "counter" ? "local" : c === "pedidosya" ? "PedidosYa" : "Uber Eats"}`}
                    >
                      <Input
                        value={o.prices[c]}
                        inputMode="decimal"
                        placeholder="Sin precio"
                        onChange={(e) =>
                          option(i, j, {
                            prices: { ...o.prices, [c]: e.target.value },
                          })
                        }
                      />
                    </Field>
                  ))}
                </div>
                {o.mode === "inherit" && !!o.inherited?.length && (
                  <p className="text-xs text-muted">
                    Heredado por elección, antes del factor:{" "}
                    {o.inherited
                      .map(
                        (c) =>
                          `${c.name ?? "Insumo"} ${c.quantity} ${c.baseUnit ?? ""}`,
                      )
                      .join(" · ")}
                  </p>
                )}
                {(o.mode === "inherit"
                  ? (o.inherited ?? [])
                  : o.components
                ).some((c) => fixed.some((f) => f.itemId === c.itemId)) && (
                  <p className="text-xs text-amber-800">
                    Este insumo también está en la parte fija. Confirmá que se
                    trate de un extra intencional.
                  </p>
                )}
                {o.kind === "composition" && (
                  <>
                    <select
                      className="form-control"
                      aria-label={`Composición ${o.name}`}
                      value={o.mode}
                      onChange={(e) =>
                        option(i, j, {
                          mode: e.target.value as OptionDraft["mode"],
                          components: [],
                        })
                      }
                    >
                      <option value="inherit">Heredado del grupo</option>
                      <option value="override">
                        Composición propia para este producto
                      </option>
                    </select>
                    {o.mode === "override" && (
                      <ComponentFields
                        value={o.components}
                        onChange={(components) => option(i, j, { components })}
                      />
                    )}
                  </>
                )}
              </div>
            ))}
          </section>
        ))}
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Field label="Grupo reutilizable">
              <select
                className="form-control"
                value={chosen}
                onChange={(e) => setChosen(e.target.value)}
              >
                <option value="">Elegí un grupo</option>
                {available
                  .filter((g) => !g.archivedAt)
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}
                    </option>
                  ))}
              </select>
            </Field>
          </div>
          <Button
            type="button"
            variant="outline"
            disabled={!chosen}
            onClick={async () => {
              setBusy(true);
              try {
                const g = await getJson<GroupDetail>(
                  `/api/modifier-groups/${chosen}`,
                );
                if (groups.some((x) => x.groupVersionId === g.versionId))
                  throw new Error("Ese grupo ya está asignado.");
                setGroups([...groups, draft(g)]);
                setChosen("");
              } catch (e) {
                setLocalError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            Agregar
          </Button>
        </div>
        <p className="text-xs text-muted">
          Completá los recargos de cada canal activo, incluso cero. Un recargo
          no es el costo del ingrediente.
        </p>
        {(error || localError) && (
          <p role="alert" className="text-sm text-red-700">
            {error || localError}
          </p>
        )}
        <div className="flex justify-end gap-2 border-t border-line pt-4">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button
            type="submit"
            disabled={
              !legacyReviewed || !targetId || (!fixed.length && !groups.length)
            }
          >
            Publicar receta
          </Button>
        </div>
      </fieldset>
    </form>
  );
}
