"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { Check, Globe2, Info, Package, Store } from "lucide-react";
import { SearchSelect, getJson } from "@/components/inventory/shared";
import { SearchCombobox } from "@/components/ui/search-combobox";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FieldCaption } from "@/components/ui/field-caption";
import { decimal } from "@/modules/inventory/decimal";

type Version = {
  version: number;
  mode: string;
  itemId: string | null;
  quantity: string | null;
};
export function BranchProductSettings({
  branchId,
  locations,
  canEditCatalog,
  locationsReady = true,
  locationsError = "",
  onReloadLocations,
}: {
  branchId: string;
  locations: { id: string; name: string }[];
  canEditCatalog: boolean;
  locationsReady?: boolean;
  locationsError?: string;
  onReloadLocations?: () => void;
}) {
  const locationId = useId();
  const [product, setProduct] = useState("");
  const [enabled, setEnabled] = useState(false);
  const [soldOut, setSoldOut] = useState(false);
  const [revision, setRevision] = useState<number | null>(null);
  const [loadedFor, setLoadedFor] = useState("");
  const [location, setLocation] = useState("");
  const [version, setVersion] = useState<Version | null>(null);
  const [globalReady, setGlobalReady] = useState(false);
  const [item, setItem] = useState("");
  const [amount, setAmount] = useState("1");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!product) return;
    let live = true;
    getJson<{
      enabled: boolean;
      dispatchLocationId: string | null;
      temporarilySoldOut: boolean;
      revision: number;
    }>(`/api/branches/${branchId}/products/${product}`)
      .then((result) => {
        if (!live) return;
        setEnabled(result.enabled);
        setSoldOut(result.temporarilySoldOut);
        setRevision(result.revision);
        setLoadedFor(`${branchId}:${product}`);
        setLocation(result.dispatchLocationId ?? "");
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    if (canEditCatalog)
      getJson<Version | null>(`/api/products/${product}/fulfillment`)
        .then((result) => {
          if (!live) return;
          setVersion(result);
          setItem(result?.itemId ?? "");
          setAmount(result?.quantity ?? "1");
          setGlobalReady(true);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [branchId, product, canEditCatalog, attempt]);
  const ready = revision !== null && loadedFor === `${branchId}:${product}`;
  async function save(event: FormEvent, direct: boolean) {
    event.preventDefault();
    if (!product || (direct ? !globalReady : !ready || !locationsReady)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const body = direct
        ? {
            mode: "direct",
            itemId: item,
            quantity: decimal(amount, 6, true, true),
            expectedVersion: version?.version ?? 0,
          }
        : {
            enabled,
            dispatchLocationId: location || null,
            temporarilySoldOut: soldOut,
            revision,
          };
      const response = await fetch(
        direct
          ? `/api/products/${product}/fulfillment`
          : `/api/branches/${branchId}/products/${product}`,
        {
          method: direct ? "POST" : "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "No pudimos guardar la configuración.");
      if (direct) setVersion(result);
      else setRevision(result.revision);
      setNotice(
        direct
          ? "Composición de reventa guardada para todas las sucursales."
          : "Configuración guardada para esta sucursal.",
      );
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No pudimos confirmar el cambio. Actualizá antes de reintentar.",
      );
    } finally {
      setBusy(false);
    }
  }
  function choose(id: string) {
    if (id === product) return;
    setProduct(id);
    setRevision(null);
    setLoadedFor("");
    setEnabled(false);
    setSoldOut(false);
    setVersion(null);
    setGlobalReady(false);
    setLocation("");
    setItem("");
    setAmount("1");
    setNotice("");
    setError("");
  }
  return (
    <section>
      <div className="branches-section-heading">
        <div>
          <p className="branches-kicker">Disponibilidad por local</p>
          <h2>Productos de la sucursal</h2>
          <p>
            Elegí un producto para configurar su venta y ubicación de despacho.
          </p>
        </div>
      </div>
      {!locationsReady &&
        (locationsError ? (
          <div role="alert" className="branches-error">
            {locationsError}
            {onReloadLocations && (
              <Button
                variant="outline"
                disabled={busy}
                onClick={onReloadLocations}
              >
                Volver a cargar ubicaciones
              </Button>
            )}
          </div>
        ) : (
          <p role="status" className="branches-loading">
            Cargando ubicaciones de esta sucursal…
          </p>
        ))}
      <div className="branches-product-picker">
        <SearchSelect
          entity="products"
          label="Producto a configurar"
          optional={false}
          value={product}
          onChange={choose}
          disabled={busy}
        />
      </div>
      {error && (
        <div role="alert" className="branches-error">
          {error}
          <Button
            variant="outline"
            disabled={busy}
            onClick={() => {
              setError("");
              setRevision(null);
              setLoadedFor("");
              setGlobalReady(false);
              setAttempt((v) => v + 1);
            }}
          >
            Volver a cargar
          </Button>
        </div>
      )}
      {notice && (
        <p role="status" className="branches-success">
          <Check aria-hidden="true" />
          {notice}
        </p>
      )}
      {!product ? (
        <div className="branches-empty branches-product-empty">
          <Package />
          <h3>Seleccioná un producto para empezar</h3>
          <p>
            La configuración de venta se guarda para esta sucursal. El catálogo
            se comparte entre todos los locales.
          </p>
        </div>
      ) : (
        <div className="branches-product-layout">
          <form
            className="branches-product-card"
            onSubmit={(e) => void save(e, false)}
          >
            <div className="branches-form-section">
              <Store aria-hidden="true" />
              <div>
                <strong>Venta en esta sucursal</strong>
                <p>Estos ajustes solo afectan al local seleccionado.</p>
              </div>
            </div>
            {!ready && !error && (
              <p role="status" className="branches-loading">
                Cargando configuración…
              </p>
            )}
            <fieldset
              disabled={busy || !ready || !locationsReady}
              className="branches-form"
            >
              <label className="branches-check branches-check-description">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                <span>
                  <strong>Habilitado para vender</strong>
                  <small>Disponible en la carta de este local.</small>
                </span>
              </label>
              <label className="branches-check branches-check-description">
                <input
                  type="checkbox"
                  checked={soldOut}
                  onChange={(e) => setSoldOut(e.target.checked)}
                />
                <span>
                  <strong>Agotado temporalmente</strong>
                  <small>Pausá su venta hasta volver a tener stock.</small>
                </span>
              </label>
              <div>
                <label htmlFor={locationId}>
                  <FieldCaption optional>
                    Ubicación de despacho de reventa
                  </FieldCaption>
                </label>
                <SearchCombobox
                  id={locationId}
                  label="Ubicación de despacho de reventa"
                  value={location}
                  selectedLabel={
                    locations.find((l) => l.id === location)?.name ?? ""
                  }
                  options={locations}
                  onChange={setLocation}
                  onSearch={() => {}}
                  placeholder="Sin ubicación asignada"
                  disabled={busy || !ready || !locationsReady}
                />
                <p className="branches-field-help">
                  Para productos comprados listos: indica de dónde se descuenta
                  el stock.
                </p>
              </div>
              <Button type="submit" className="branches-action">
                <Check />
                {busy ? "Guardando…" : "Guardar en esta sucursal"}
              </Button>
            </fieldset>
          </form>
          {canEditCatalog && (
            <details className="branches-product-global">
              <summary>
                <Globe2 aria-hidden="true" />
                <span>
                  <strong>Composición de reventa</strong>
                  <small>Configuración compartida · Todas las sucursales</small>
                </span>
              </summary>
              <form
                onSubmit={(e) => void save(e, true)}
                className="branches-form"
              >
                <div className="branches-info">
                  <Info aria-hidden="true" />
                  <p>
                    Usá esta opción para artículos comprados listos. Si el
                    producto se elabora, su composición se configura en Recetas.
                    Publicar una composición de reventa cambia el modo de
                    descuento en todos los locales.
                  </p>
                </div>
                {!globalReady && !error && (
                  <p role="status">Cargando composición…</p>
                )}
                <fieldset disabled={busy || !globalReady}>
                  <SearchSelect
                    entity="items"
                    label="Artículo de reventa"
                    value={item}
                    onChange={setItem}
                    required
                    disabled={busy || !globalReady}
                  />
                  <label>
                    <FieldCaption required>
                      Cantidad base por unidad vendida
                    </FieldCaption>
                    <Input
                      required
                      inputMode="decimal"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                    />
                    <small>
                      Se expresa en la unidad base del artículo de inventario.
                    </small>
                  </label>
                  <Button
                    type="submit"
                    variant="outline"
                    className="branches-action"
                  >
                    <Globe2 />
                    {busy ? "Guardando…" : "Publicar composición de reventa"}
                  </Button>
                </fieldset>
              </form>
            </details>
          )}
        </div>
      )}
    </section>
  );
}
