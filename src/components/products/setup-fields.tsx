"use client";
import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import { SearchCombobox } from "@/components/ui/search-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldCaption } from "@/components/ui/field-caption";
import { OperationAlert } from "@/components/ui/operation-alert";
import { useErrorFeedback } from "@/components/ui/use-error-feedback";
import { getJson } from "@/components/inventory/shared";
import { money } from "@/lib/number-format";
import type { productSetupOptions } from "@/modules/products/onboarding";
type Options = Awaited<ReturnType<typeof productSetupOptions>>;
export type ProductMode = "recipe" | "direct" | "combo";
export type ProductSetupDraft = {
  branchId: string;
  mode: ProductMode;
  branchRevision: number;
  enabled: boolean;
  expectedVersion: number;
  dispatchLocationId: string;
  stationId: string;
  preparationRevision: number;
  quantity: string;
  sourceMode: "existing" | "new";
  itemId: string;
  itemName: string;
  newItemName: string;
  newItemClass: string;
  newItemCost: string;
};
export function productSetupPayload(
  value: ProductSetupDraft,
  productName: string,
) {
  const common = {
    branchId: value.branchId,
    mode: value.mode,
    branchRevision: value.branchRevision,
    enabled: value.enabled,
  };
  if (value.mode === "combo") return common;
  if (value.mode === "recipe")
    return {
      ...common,
      stationId: value.stationId,
      preparationRevision: value.preparationRevision,
    };
  return {
    ...common,
    expectedVersion: value.expectedVersion,
    quantity: value.quantity,
    dispatchLocationId: value.dispatchLocationId,
    source:
      value.sourceMode === "existing"
        ? { itemId: value.itemId }
        : {
            newItem: {
              name: value.newItemName || productName,
              class: value.newItemClass,
              unitCost: value.newItemCost,
            },
          },
  };
}
export function ProductSetupFields({
  productId,
  initialKind,
  productName,
  value,
  onChange,
  onKindChange,
  disabled,
}: {
  productId?: string;
  initialKind?: string;
  productName: string;
  value: ProductSetupDraft | null;
  onChange: Dispatch<SetStateAction<ProductSetupDraft | null>>;
  onKindChange: (kind: string) => void;
  disabled: boolean;
}) {
  const [data, setData] = useState<Options>();
  const [error, setError, errorAttempt] = useErrorFeedback();
  const [refresh, setRefresh] = useState(0);
  const [query, setQuery] = useState("");
  const [articles, setArticles] = useState<
    { id: string; name: string; unitCost: string | null }[]
  >([]);
  const [loadingArticles, setLoadingArticles] = useState(false);
  useEffect(() => {
    let live = true;
    getJson<Options>(
      `/api/products/setup${productId ? `?productId=${productId}` : ""}`,
    )
      .then((result) => {
        if (!live) return;
        const saved = result.current;
        setData(result);
        setError("");
        onChange({
          branchId: result.branch.id,
          mode: (saved?.mode ??
            (initialKind === "combo" ? "combo" : "recipe")) as ProductMode,
          branchRevision: saved?.branchRevision ?? 0,
          enabled: saved?.enabled ?? true,
          expectedVersion: saved?.expectedVersion ?? 0,
          dispatchLocationId:
            saved?.dispatchLocationId ||
            (result.locations.length === 1 ? result.locations[0].id : ""),
          stationId:
            saved?.stationId ||
            (result.stations.length === 1 ? result.stations[0].id : ""),
          preparationRevision: saved?.preparationRevision ?? 0,
          quantity: (saved?.quantity ?? "1")
            .replace(/(\.\d*?)0+$/, "$1")
            .replace(/\.$/, "")
            .replace(".", ","),
          sourceMode: "existing",
          itemId: saved?.itemId ?? "",
          itemName: saved?.itemName ?? "",
          newItemName: "",
          newItemClass: "beverage",
          newItemCost: "",
        });
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [productId, initialKind, onChange, refresh, setError]);
  const sourceMode = value?.sourceMode,
    mode = value?.mode;
  useEffect(() => {
    if (mode !== "direct" || sourceMode !== "existing") return;
    let live = true;
    const timer = setTimeout(() => {
      setLoadingArticles(true);
      getJson<{
        rows: {
          id: string;
          name: string;
          baseUnit: string;
          stockTracked: boolean;
          class: string;
          unitCost: string | null;
        }[];
      }>(`/api/catalog/items?q=${encodeURIComponent(query)}`)
        .then((result) => {
          if (live) {
            setArticles(
              result.rows.filter(
                (i) =>
                  i.baseUnit === "unit" &&
                  i.stockTracked &&
                  ["food", "beverage", "packaging", "other"].includes(i.class),
              ),
            );
            setError("");
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        })
        .finally(() => {
          if (live) setLoadingArticles(false);
        });
    }, 180);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [query, mode, sourceMode, setError]);
  function update(patch: Partial<ProductSetupDraft>) {
    onChange((current) => (current ? { ...current, ...patch } : current));
  }
  const selectedItem = articles.find((i) => i.id === value?.itemId);
  return (
    <section className="space-y-5 rounded-xl border border-line p-5 sm:p-6">
      <div>
        <h3 className="font-semibold text-brand">
          Cómo se vende y de dónde sale el stock
        </h3>
        <p className="mt-2 text-sm text-muted">
          {data
            ? `Sucursal: ${data.branch.name}. Esta configuración se guarda junto con el producto.`
            : "Cargando la sucursal seleccionada…"}
        </p>
      </div>
      <OperationAlert
        title="No pudimos cargar la configuración"
        message={error}
        eventKey={errorAttempt}
        tone="error"
      />
      {error && (
        <div className="space-y-2">
          {!value && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setRefresh((n) => n + 1)}
            >
              Reintentar configuración
            </Button>
          )}
        </div>
      )}
      {value && data && (
        <fieldset disabled={disabled} className="space-y-5">
          <label className="block text-sm font-medium">
            <FieldCaption required>Tipo de producto</FieldCaption>
            <select
              className="form-control mt-2"
              value={value.mode}
              required
              onChange={(e) => {
                const next = e.target.value as ProductMode;
                update({ mode: next });
                onKindChange(next === "combo" ? "combo" : "individual");
              }}
            >
              <option
                value="recipe"
                disabled={
                  initialKind === "combo" ||
                  (data.current?.modeLocked && data.current.mode !== "recipe")
                }
              >
                Lo elaboramos
              </option>
              <option
                value="direct"
                disabled={
                  initialKind === "combo" ||
                  (data.current?.modeLocked && data.current.mode !== "direct")
                }
              >
                Lo compramos listo
              </option>
              <option
                value="combo"
                disabled={!!productId && initialKind !== "combo"}
              >
                Es un combo
              </option>
            </select>
          </label>
          {value.mode === "direct" && (
            <>
              <label className="block text-sm font-medium">
                <FieldCaption required>Artículo de inventario</FieldCaption>
                <select
                  className="form-control mt-2"
                  value={value.sourceMode}
                  required
                  onChange={(e) =>
                    update({ sourceMode: e.target.value as "existing" | "new" })
                  }
                >
                  <option value="existing">Usar un artículo existente</option>
                  <option value="new">Crear el artículo al guardar</option>
                </select>
              </label>
              {value.sourceMode === "existing" ? (
                <div className="space-y-2">
                  <label
                    className="block text-sm font-medium"
                    htmlFor={`resale-${productId ?? "new"}`}
                  >
                    <FieldCaption required>Buscar artículo</FieldCaption>
                  </label>
                  <SearchCombobox
                    id={`resale-${productId ?? "new"}`}
                    label="Buscar artículo"
                    value={value.itemId}
                    selectedLabel={value.itemName}
                    options={articles}
                    loading={loadingArticles}
                    required
                    onSearch={setQuery}
                    onChange={(id) =>
                      update({
                        itemId: id,
                        itemName: articles.find((i) => i.id === id)?.name ?? "",
                      })
                    }
                  />
                  <p className="text-xs text-muted">
                    Se reutilizan su stock, proveedores y costo.
                    {selectedItem
                      ? ` Costo de referencia por unidad: ${selectedItem.unitCost === null ? "pendiente" : money(selectedItem.unitCost)}.`
                      : ""}
                  </p>
                </div>
              ) : (
                <div className="grid gap-5 sm:grid-cols-2">
                  <label className="block text-sm font-medium">
                    <FieldCaption required>Nombre del artículo</FieldCaption>
                    <Input
                      className="mt-2"
                      required
                      value={value.newItemName || productName}
                      onChange={(e) => update({ newItemName: e.target.value })}
                    />
                  </label>
                  <label className="block text-sm font-medium">
                    <FieldCaption required>Clase del artículo</FieldCaption>
                    <select
                      className="form-control mt-2"
                      value={value.newItemClass}
                      required
                      onChange={(e) => update({ newItemClass: e.target.value })}
                    >
                      <option value="beverage">Bebida</option>
                      <option value="food">Alimento</option>
                      <option value="packaging">Descartable</option>
                      <option value="other">Otro</option>
                    </select>
                  </label>
                  <label className="block text-sm font-medium sm:col-span-2">
                    <FieldCaption optional>
                      Costo de compra por unidad
                    </FieldCaption>
                    <Input
                      className="mt-2"
                      inputMode="decimal"
                      placeholder="Por ejemplo, 1.200,50"
                      value={value.newItemCost}
                      onChange={(e) => update({ newItemCost: e.target.value })}
                    />
                    <span className="mt-2 block text-xs text-muted">
                      En pesos. Opcional; podés completar el costo después. El
                      artículo se creará sin existencias iniciales.
                    </span>
                  </label>
                </div>
              )}
              <div className="grid gap-5 sm:grid-cols-2">
                <label className="block text-sm font-medium">
                  <FieldCaption required>
                    Unidades de inventario por venta
                  </FieldCaption>
                  <Input
                    className="mt-2"
                    inputMode="decimal"
                    required
                    value={value.quantity}
                    onChange={(e) => update({ quantity: e.target.value })}
                  />
                  <span className="mt-2 block text-xs text-muted">
                    Para una lata o botella, dejá 1.
                  </span>
                </label>
                <label className="block text-sm font-medium">
                  <FieldCaption required>Dónde está el stock</FieldCaption>
                  <select
                    className="form-control mt-2"
                    required
                    value={value.dispatchLocationId}
                    onChange={(e) =>
                      update({ dispatchLocationId: e.target.value })
                    }
                  >
                    <option value="">Elegí una ubicación</option>
                    {data.locations.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <p className="text-sm text-muted">
                El costo se obtiene del artículo. El stock se descuenta al
                entregar el producto.
              </p>
            </>
          )}
          {value.mode === "recipe" && (
            <>
              <label className="block text-sm font-medium">
                <FieldCaption required>Dónde se prepara</FieldCaption>
                <select
                  className="form-control mt-2"
                  required
                  value={value.stationId}
                  onChange={(e) => update({ stationId: e.target.value })}
                >
                  <option value="">Elegí una estación</option>
                  {data.stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-sm text-muted">
                Después de guardar, cargá la receta en esta misma ficha. Los
                ingredientes se descuentan al terminar la preparación.
              </p>
            </>
          )}
          {value.mode === "combo" && (
            <p className="text-sm text-muted">
              Después de guardar, elegí sus productos en Componentes. Cada uno
              conserva su receta o artículo de inventario.
            </p>
          )}
          <label className="flex items-start gap-3 rounded-lg bg-surface p-4 text-sm">
            <input
              className="mt-0.5"
              type="checkbox"
              checked={value.enabled}
              onChange={(e) => update({ enabled: e.target.checked })}
            />
            <span>
              Disponible en {data.branch.name}
              <span className="mt-1 block text-xs text-muted">
                Se habilita al guardar. Para vender, completá el artículo, la
                receta o los componentes según corresponda.
              </span>
            </span>
          </label>
        </fieldset>
      )}
    </section>
  );
}
