"use client";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchCombobox } from "@/components/ui/search-combobox";
import { OperationAlert } from "@/components/ui/operation-alert";
import { getJson, money } from "@/components/inventory/shared";
import type { ComboDefinition } from "@/modules/combos/service";
import type { ProductCost } from "@/modules/catalog/product-cost-model";
type Option = {
  productId: string;
  name: string;
  counter: string;
  pedidosya: string;
  ubereats: string;
};
type Group = { name: string; quantity: number; options: Option[] };
export function ComboTab({
  productId,
  view,
  onBusy,
  onSaved,
}: {
  productId: string;
  view: "recipe" | "cost";
  onBusy: (busy: boolean) => void;
  onSaved: () => void;
}) {
  const [groups, setGroups] = useState<Group[]>([]),
    [revision, setRevision] = useState(0),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [query, setQuery] = useState("");
  const [choices, setChoices] = useState<
      { id: string; name: string; kind: string }[]
    >([]),
    [cost, setCost] = useState<ProductCost | null>(null);
  const [costRefresh, setCostRefresh] = useState(0);
  useEffect(() => {
    let live = true;
    getJson<ComboDefinition | null>(`/api/products/${productId}/combo`)
      .then((d) => {
        if (live) {
          setGroups(
            d?.groups.map((g) => ({
              name: g.name,
              quantity: g.quantity,
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
  }, [productId]);
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
  }, [query, productId]);
  useEffect(() => {
    if (view !== "cost") return;
    let live = true;
    fetch("/api/products/costs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: [productId] }),
    })
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (live) setCost(d.products[0]);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [view, productId, revision, costRefresh]);
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
            ...g,
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
      setCost(null);
      setNotice("Los componentes del combo están publicados.");
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      onBusy(false);
    }
  }
  return (
    <div className="space-y-6">
      <OperationAlert
        title={error ? "No se pudo completar" : "Combo publicado"}
        message={error || notice}
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
          <Button
            className="mt-5"
            variant="outline"
            onClick={() => {
              setError("");
              setCost(null);
              setCostRefresh((n) => n + 1);
            }}
          >
            Actualizar costo
          </Button>
        </div>
      ) : (
        <fieldset disabled={busy || !ready} className="space-y-6">
          <p className="text-sm text-muted">
            Elegí los productos existentes. Cada uno conserva sus recetas,
            modificadores y mermas. El cliente elige un producto por grupo; un
            grupo con una sola opción es fijo.
          </p>
          {groups.map((g, i) => (
            <section
              key={i}
              className="space-y-5 rounded-xl border border-line p-5"
            >
              <div className="grid gap-5 sm:grid-cols-[1fr_160px_auto]">
                <label>
                  Nombre del grupo
                  <Input
                    value={g.name}
                    onChange={(e) => update(i, { ...g, name: e.target.value })}
                  />
                </label>
                <label>
                  Unidades por combo
                  <Input
                    type="number"
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
                  onClick={() => setGroups(groups.filter((_, j) => j !== i))}
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
                        Adicional {label}
                        <Input
                          inputMode="decimal"
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
            </section>
          ))}
          <div className="flex flex-wrap justify-between gap-3">
            <Button
              variant="outline"
              disabled={groups.length >= 10}
              onClick={() =>
                setGroups([...groups, { name: "", quantity: 1, options: [] }])
              }
            >
              Agregar grupo
            </Button>
            <Button disabled={!groups.length} onClick={() => void save()}>
              {busy ? "Publicando…" : "Publicar componentes"}
            </Button>
          </div>
        </fieldset>
      )}
    </div>
  );
}
