"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldCaption } from "@/components/ui/field-caption";
import { SearchCombobox } from "@/components/ui/search-combobox";
import { OperationAlert } from "@/components/ui/operation-alert";
import { useErrorFeedback } from "@/components/ui/use-error-feedback";
import { getJson, money } from "@/components/inventory/shared";
import type { ComboDefinition } from "@/modules/combos/service";
import type { ProductCost } from "@/modules/catalog/product-cost-model";
import {
  applyGroupVersion,
  compareGroupVersion,
  type ComboGroupDraft as Group,
} from "@/modules/combos/group-draft";
import type { ProductGroupDefinition } from "@/modules/combos/product-groups";
export function ComboTab({
  productId,
  view,
  onBusy,
  onSaved,
  cost,
}: {
  productId: string;
  view: "recipe" | "cost";
  onBusy: (busy: boolean) => void;
  onSaved: () => void;
  cost?: ProductCost;
}) {
  const [groups, setGroups] = useState<Group[]>([]),
    [revision, setRevision] = useState(0),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError, errorAttempt] = useErrorFeedback(),
    [notice, setNotice] = useState(""),
    [query, setQuery] = useState("");
  const [choices, setChoices] = useState<
    { id: string; name: string; kind: string }[]
  >([]);
  const [sharedGroups, setSharedGroups] = useState<
    { id: string; name: string; archivedAt: string | null }[]
  >([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [review, setReview] = useState<{
    index: number;
    definition: ProductGroupDefinition;
  } | null>(null);
  const promotionKeys = useRef(new Map<string, string>());
  useEffect(() => {
    let live = true;
    getJson<typeof sharedGroups>("/api/product-option-groups")
      .then((rows) => {
        if (live) setSharedGroups(rows);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [productId, setError]);
  useEffect(() => {
    let live = true;
    getJson<ComboDefinition | null>(`/api/products/${productId}/combo`)
      .then((d) => {
        if (live) {
          setGroups(
            d?.groups.map((g) => ({
              draftId: crypto.randomUUID(),
              name: g.name,
              quantity: g.quantity,
              source: g.source,
              options: g.options.map((o) => ({
                productId: o.productId,
                name: o.name,
                counter: o.counter,
                pedidosya: o.pedidosya,
                ubereats: o.ubereats,
              })),
            })) ?? [],
          );
          setRevision(d?.revision ?? 0);
          setReady(true);
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [productId, setError]);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      getJson<{ rows: typeof choices }>(
        `/api/catalog/products?q=${encodeURIComponent(query)}`,
      )
        .then((d) => {
          if (live)
            setChoices(
              d.rows.filter((p) => p.kind !== "combo" && p.id !== productId),
            );
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, productId, setError]);
  const update = (i: number, g: Group) =>
    setGroups((all) => all.map((x, j) => (i === j ? g : x)));
  async function save() {
    setBusy(true);
    onBusy(true);
    setError("");
    setNotice("");
    try {
      const r = await fetch(`/api/products/${productId}/combo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requestId: crypto.randomUUID(),
          revision,
          groups: groups.map((g) => ({
            name: g.name,
            quantity: g.quantity,
            sourceGroupId: g.source?.groupId,
            sourceGroupVersionId: g.source?.versionId,
            options: g.options.map(({ name, ...o }) => {
              void name;
              return o;
            }),
          })),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setRevision(d.revision);
      setNotice("Los componentes del combo están publicados.");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  async function groupAction(action: () => Promise<void>) {
    setBusy(true);
    onBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  async function addShared(id: string) {
    await groupAction(async () => {
      const definition = await getJson<ProductGroupDefinition>(
        `/api/product-option-groups/${id}`,
      );
      if (definition.archivedAt)
        throw Error("El grupo fue archivado. Elegí otro.");
      if (groups.some((g) => g.source?.groupId === id))
        throw Error("Ese grupo ya está incluido en el combo.");
      if (groups.length >= 10) throw Error("El combo admite hasta 10 grupos.");
      setGroups((all) => [
        ...all,
        { ...applyGroupVersion(definition), draftId: crypto.randomUUID() },
      ]);
      setPickerOpen(false);
    });
  }
  async function promote(index: number) {
    await groupAction(async () => {
      const current = groups[index];
      const payload = {
        name: current.name,
        productIds: current.options.map((o) => o.productId),
      };
      const key = JSON.stringify({ draftId: current.draftId, payload });
      if (!promotionKeys.current.has(key))
        promotionKeys.current.set(key, crypto.randomUUID());
      const response = await fetch("/api/product-option-groups", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...payload,
          requestId: promotionKeys.current.get(key),
        }),
      });
      const result = await response.json();
      if (!response.ok) throw Error(result.error);
      const definition = result as ProductGroupDefinition;
      update(index, applyGroupVersion(definition, current));
      promotionKeys.current.delete(key);
      setSharedGroups((all) => [
        ...all.filter((g) => g.id !== definition.id),
        { id: definition.id, name: definition.name, archivedAt: null },
      ]);
      setNotice(
        "Grupo reutilizable creado. Publicá los componentes para guardar su vínculo con este combo.",
      );
    });
  }
  return (
    <div className="space-y-6">
      <OperationAlert
        title={error ? "No se pudo completar" : "Combo publicado"}
        message={error || notice}
        eventKey={error ? errorAttempt : undefined}
        tone={error ? "error" : "success"}
      />
      {view === "cost" ? (
        <div className="rounded-xl border border-line p-6">
          <h3 className="font-semibold">Costo estimado del combo</h3>
          <p className="mt-2 text-muted">
            Suma las recetas y los modificadores de los productos incluidos, en
            la sucursal seleccionada.
          </p>
          <p className="mt-5 text-xl font-semibold">
            {!cost
              ? "Consultando costos…"
              : cost.min === null || cost.max === null
                ? "Costo pendiente"
                : cost.min === cost.max
                  ? money(cost.min)
                  : `${money(cost.min)} – ${money(cost.max)}`}
          </p>
          {cost?.pendingReasons && cost.pendingReasons.length > 0 && (
            <div className="mt-5 space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm">
              <h4 className="font-semibold text-brand">
                Qué falta para calcularlo
              </h4>
              <ul className="list-disc space-y-2 pl-5">
                {cost.pendingReasons.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
              <p>
                Completá la ficha de cada componente en Catálogo y precios. Para
                una bebida, elegí «Lo compramos listo», vinculá su artículo y
                dejá una unidad por venta. Su disponibilidad en la sucursal se
                guarda desde esa misma ficha.
              </p>
              <p>
                El costo viene del inventario de la sucursal o de la referencia
                del artículo. El precio de venta no se usa como costo.
              </p>
            </div>
          )}
        </div>
      ) : (
        <fieldset disabled={busy || !ready} className="space-y-6">
          <p className="text-sm text-muted">
            Elegí los productos existentes. Cada uno conserva sus recetas,
            modificadores y mermas. El cliente elige un producto por grupo; un
            grupo con una sola opción es fijo.
          </p>
          <p className="text-sm font-semibold">
            <FieldCaption required>Grupos del combo</FieldCaption>
            <span className="mt-1 block text-xs font-normal text-muted">
              Agregá al menos un grupo con un producto.
            </span>
          </p>
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-5">
            <p className="text-sm text-muted">
              Reutilizá una lista de productos en varios combos.
            </p>
            <Link
              href="/products/combo-groups"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium text-blue underline-offset-4 hover:underline"
            >
              Administrar grupos ↗
            </Link>
          </div>
          {groups.map((g, i) => (
            <section
              key={g.draftId ?? i}
              className="space-y-5 rounded-xl border border-line p-5"
            >
              {g.source && (
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
                  <p className="font-medium text-brand">
                    Grupo compartido · Versión {g.source.revision}
                    {g.source.archived ? " · Archivado" : ""}
                  </p>
                  {!g.source.archived &&
                    g.source.latestRevision > g.source.revision && (
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-blue">
                          Hay una actualización disponible
                        </span>
                        <Button
                          variant="outline"
                          onClick={() =>
                            void groupAction(async () => {
                              const definition =
                                await getJson<ProductGroupDefinition>(
                                  `/api/product-option-groups/${g.source!.groupId}`,
                                );
                              if (definition.archivedAt)
                                throw Error("El grupo está archivado.");
                              setReview({ index: i, definition });
                            })
                          }
                        >
                          Revisar cambios
                        </Button>
                      </div>
                    )}
                </div>
              )}
              {review?.index === i &&
                (() => {
                  const diff = compareGroupVersion(g, review.definition);
                  return (
                    <section
                      aria-label="Revisión del grupo"
                      className="space-y-4 rounded-lg border border-blue/20 bg-blue/5 p-5"
                    >
                      <h4 className="font-semibold">
                        Revisar actualización a versión{" "}
                        {review.definition.revision}
                      </h4>
                      {diff.renamed && (
                        <p className="text-sm">
                          Nombre: {g.name} → {review.definition.name}
                        </p>
                      )}
                      <p className="text-sm">
                        Se agregan: {diff.added.join(", ") || "ningún producto"}
                        .
                      </p>
                      <p className="text-sm">
                        Se quitan:{" "}
                        {diff.removed.join(", ") || "ningún producto"}.
                      </p>
                      <p className="text-xs text-muted">
                        Se conservan tus unidades y los adicionales de los
                        productos que permanecen. Los nuevos empiezan con
                        adicional cero. El cambio se hace efectivo al publicar
                        los componentes.
                      </p>
                      <div className="flex flex-wrap justify-end gap-3">
                        <Button variant="ghost" onClick={() => setReview(null)}>
                          Cancelar revisión
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => {
                            if (g.source?.groupId !== review.definition.id)
                              return;
                            update(i, applyGroupVersion(review.definition, g));
                            setReview(null);
                          }}
                        >
                          Aplicar al borrador
                        </Button>
                      </div>
                    </section>
                  );
                })()}
              <div className="grid gap-5 sm:grid-cols-[1fr_160px_auto]">
                <label>
                  <FieldCaption required={!g.source}>
                    Nombre del grupo
                  </FieldCaption>
                  <Input
                    value={g.name}
                    required={!g.source}
                    readOnly={!!g.source}
                    onChange={(e) => update(i, { ...g, name: e.target.value })}
                  />
                </label>
                <label>
                  <FieldCaption required>Unidades por combo</FieldCaption>
                  <Input
                    type="number"
                    required
                    min={1}
                    max={99}
                    value={g.quantity}
                    onChange={(e) =>
                      update(i, { ...g, quantity: Number(e.target.value) })
                    }
                  />
                </label>
                <Button
                  variant="ghost"
                  onClick={() => {
                    setGroups(groups.filter((_, j) => j !== i));
                    setReview(null);
                  }}
                >
                  Quitar grupo
                </Button>
              </div>
              {g.options.map((o, j) => (
                <div
                  key={o.productId}
                  className="space-y-3 border-t border-line pt-4"
                >
                  <div className="flex justify-between">
                    <strong>{o.name}</strong>
                    {!g.source && (
                      <Button
                        variant="ghost"
                        onClick={() =>
                          update(i, {
                            ...g,
                            options: g.options.filter((_, k) => k !== j),
                          })
                        }
                      >
                        Quitar
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    {(
                      [
                        ["counter", "Mostrador"],
                        ["pedidosya", "PedidosYa"],
                        ["ubereats", "Uber Eats"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="text-sm">
                        <FieldCaption required>
                          Adicional final {label} (IVA incluido)
                        </FieldCaption>
                        <Input
                          inputMode="decimal"
                          required
                          value={o[key]}
                          onChange={(e) =>
                            update(i, {
                              ...g,
                              options: g.options.map((x, k) =>
                                j === k
                                  ? {
                                      ...x,
                                      [key]: e.target.value.replace(",", "."),
                                    }
                                  : x,
                              ),
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                </div>
              ))}
              {!g.source && (
                <div className="space-y-2">
                  <p className="text-sm font-medium">
                    <FieldCaption required>Productos incluidos</FieldCaption>
                    <span className="mt-1 block text-xs font-normal text-muted">
                      Elegí al menos un producto para este grupo.
                    </span>
                  </p>
                  <SearchCombobox
                    id={`combo-product-${i}`}
                    label="Agregar producto al grupo"
                    value=""
                    selectedLabel=""
                    options={choices.filter(
                      (p) => !g.options.some((o) => o.productId === p.id),
                    )}
                    onSearch={setQuery}
                    onChange={(id) => {
                      const p = choices.find((p) => p.id === id);
                      if (p)
                        update(i, {
                          ...g,
                          options: [
                            ...g.options,
                            {
                              productId: p.id,
                              name: p.name,
                              counter: "0",
                              pedidosya: "0",
                              ubereats: "0",
                            },
                          ],
                        });
                    }}
                  />
                </div>
              )}
              {!g.source && (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                  <p className="text-xs text-muted">
                    Guardá esta lista para usarla en otros combos.
                  </p>
                  <Button
                    variant="outline"
                    disabled={!g.name.trim() || !g.options.length}
                    onClick={() => void promote(i)}
                  >
                    Guardar como grupo reutilizable
                  </Button>
                </div>
              )}
            </section>
          ))}
          {pickerOpen && (
            <section className="space-y-3 rounded-xl border border-line p-5">
              <label
                className="block text-sm font-medium"
                htmlFor="shared-combo-group"
              >
                Elegir grupo existente
              </label>
              <SearchCombobox
                id="shared-combo-group"
                label="Elegir grupo existente"
                value=""
                selectedLabel=""
                options={sharedGroups.filter(
                  (s) =>
                    !s.archivedAt &&
                    !groups.some((g) => g.source?.groupId === s.id),
                )}
                onSearch={() => {}}
                onChange={(id) => void addShared(id)}
              />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-muted">
                  Cada combo conserva sus unidades y adicionales.
                </p>
                <Button variant="ghost" onClick={() => setPickerOpen(false)}>
                  Cerrar selector
                </Button>
              </div>
            </section>
          )}
          <div className="flex flex-wrap justify-between gap-3">
            <div className="flex flex-wrap gap-3">
              <Button
                variant="outline"
                disabled={groups.length >= 10}
                onClick={() =>
                  setGroups([
                    ...groups,
                    {
                      draftId: crypto.randomUUID(),
                      name: "",
                      quantity: 1,
                      options: [],
                    },
                  ])
                }
              >
                Agregar grupo
              </Button>
              <Button
                variant="outline"
                disabled={groups.length >= 10}
                onClick={() => setPickerOpen((open) => !open)}
              >
                Usar grupo existente
              </Button>
            </div>
            <Button disabled={!groups.length} onClick={() => void save()}>
              {busy ? "Publicando…" : "Publicar componentes"}
            </Button>
          </div>
        </fieldset>
      )}
    </div>
  );
}
