"use client";
import { useEffect, useState, type FormEvent } from "react";
import { SearchSelect, getJson } from "@/components/inventory/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
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
}: {
  branchId: string;
  locations: { id: string; name: string }[];
  canEditCatalog: boolean;
}) {
  const [product, setProduct] = useState(""),
    [enabled, setEnabled] = useState(false),
    [location, setLocation] = useState(""),
    [version, setVersion] = useState<Version | null>(null),
    [item, setItem] = useState(""),
    [amount, setAmount] = useState("1"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    if (!product) return;
    let live = true;
    getJson<{ enabled: boolean; dispatchLocationId: string | null }>(
      `/api/branches/${branchId}/products/${product}`,
    )
      .then((r) => {
        if (live) {
          setEnabled(r.enabled);
          setLocation(r.dispatchLocationId ?? "");
        }
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    if (canEditCatalog)
      getJson<Version | null>(`/api/products/${product}/fulfillment`)
        .then((r) => {
          if (live) {
            setVersion(r);
            setItem(r?.itemId ?? "");
            setAmount(r?.quantity ?? "1");
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [branchId, product, canEditCatalog]);
  async function save(e: FormEvent, direct: boolean) {
    e.preventDefault();
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
        : { enabled, dispatchLocationId: location || null };
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
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar.");
      if (direct) setVersion(result);
      setNotice("Configuración guardada.");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "No se pudo confirmar el cambio. Actualizá antes de reintentar.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Card className="space-y-5 p-6">
      <h2 className="text-lg font-bold">Productos de esta sucursal</h2>
      <SearchSelect
        entity="products"
        label="Producto"
        value={product}
        onChange={(id) => {
          setProduct(id);
          setEnabled(false);
          setVersion(null);
          setNotice("");
        }}
        disabled={busy}
      />
      {error && (
        <p role="alert" className="text-red-700">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {product && (
        <>
          <form onSubmit={(e) => void save(e, false)}>
            <fieldset disabled={busy} className="space-y-3">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                />
                Habilitado para vender en esta sucursal
              </label>
              <label className="block text-sm font-semibold">
                Ubicación de despacho de reventa
                <select
                  className="mt-2 block w-full rounded border p-2"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                >
                  <option value="">Sin ubicación</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
              </label>
              <Button type="submit">Guardar habilitación</Button>
            </fieldset>
          </form>
          {canEditCatalog && (
            <form
              className="space-y-3 border-t pt-5"
              onSubmit={(e) => void save(e, true)}
            >
              <h3 className="font-semibold">
                Vender un artículo comprado listo
              </h3>
              <p className="text-sm text-muted">
                Esta composición es compartida por todas las sucursales. Los
                productos elaborados se configuran desde Recetas.
              </p>
              <fieldset disabled={busy} className="space-y-3">
                <SearchSelect
                  entity="items"
                  label="Artículo de reventa"
                  value={item}
                  onChange={setItem}
                  required
                />
                <label className="block text-sm font-semibold">
                  Cantidad base por unidad vendida
                  <Input
                    required
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
                <Button type="submit">Publicar composición de reventa</Button>
              </fieldset>
            </form>
          )}
        </>
      )}
    </Card>
  );
}
