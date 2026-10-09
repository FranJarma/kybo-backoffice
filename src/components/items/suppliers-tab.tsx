"use client";
import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import Link from "next/link";
import { Plus, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  date,
  getJson,
  money,
  quantity,
  SearchSelect,
  today,
  useOperation,
} from "@/components/inventory/shared";
import type { ItemSourcing } from "@/modules/sourcing/service";
import type { SourcingInput } from "@/modules/sourcing/validation";
import { presentationQuantity } from "@/modules/sourcing/quantities";
import { entryUnits, baseUnit } from "@/modules/catalog/entry-units";

type Mode = "link" | "presentation" | "quote" | null;
const comparisonMoney = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
});
export function ItemSuppliersTab({
  itemId,
  revision,
  actorId,
  onBusy,
}: {
  itemId: string;
  revision: number;
  actorId: string;
  onBusy: (busy: boolean) => void;
}) {
  const [data, setData] = useState<ItemSourcing | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>(null);
  const [supplierId, setSupplierId] = useState("");
  const [presentationId, setPresentationId] = useState("");
  const [quotePack, setQuotePack] = useState<
    ItemSourcing["presentations"][number] | null
  >(null);
  const [name, setName] = useState("");
  const [units, setUnits] = useState("1");
  const [content, setContent] = useState("1");
  const [unit, setUnit] = useState<"l" | "ml" | "kg" | "g" | "unit">("ml");
  const [price, setPrice] = useState("");
  const [quotedOn, setQuotedOn] = useState(today);
  const [validUntil, setValidUntil] = useState("");
  const [leadTime, setLeadTime] = useState("");
  const [minimum, setMinimum] = useState("1");
  const [notice, setNotice] = useState("");
  const formId = useId();
  const url = `/api/items/${itemId}/suppliers`;
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await getJson<ItemSourcing>(url));
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No pudimos cargar los proveedores.",
      );
    } finally {
      setLoading(false);
    }
  }, [url]);
  useEffect(() => {
    let live = true;
    getJson<ItemSourcing>(url)
      .then((result) => {
        if (live) {
          setData(result);
          setError("");
        }
      })
      .catch((e) => {
        if (live)
          setError(
            e instanceof Error
              ? e.message
              : "No pudimos cargar los proveedores.",
          );
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [url, revision]);
  const success = useCallback(() => {
    setMode(null);
    setNotice("Guardado. El stock y su costo no cambiaron.");
    void load();
  }, [load]);
  const operation = useOperation<SourcingInput>(
    actorId,
    "item-sourcing",
    success,
  );
  useEffect(() => {
    onBusy(operation.busy || operation.uncertain);
    return () => onBusy(false);
  }, [onBusy, operation.busy, operation.uncertain]);
  const locked = operation.locked || loading;
  const canEdit = !!data && !data.item.archived && data.item.purchasable;
  const pack = quotePack;
  function start(next: Mode, vendor = "", packId = "") {
    setMode(next);
    setSupplierId(vendor);
    setPresentationId(packId);
    setQuotePack(data?.presentations.find((p) => p.id === packId) ?? null);
    setError("");
    setNotice("");
    operation.clearError();
    setName("");
    setUnits("1");
    setContent("1");
    setUnit(
      data?.item.baseUnit === "ml"
        ? "l"
        : data?.item.baseUnit === "g"
          ? "kg"
          : "unit",
    );
    setPrice("");
    setQuotedOn(today());
    setValidUntil("");
    setLeadTime("");
    setMinimum("1");
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (locked || !canEdit || !mode) return;
    setError("");
    const requestId = crypto.randomUUID();
    if (mode === "link")
      operation.submit(url, { action: mode, requestId, supplierId });
    else if (mode === "presentation") {
      try {
        presentationQuantity(units, content, unit);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Revisá el contenido.");
        return;
      }
      operation.submit(url, {
        action: mode,
        requestId,
        supplierId,
        name,
        unitsPerPack: units,
        contentPerUnit: content,
        unit,
      });
    } else if (pack) {
      if (
        data?.presentations.find((p) => p.id === pack.id)?.revision !==
        pack.revision
      ) {
        setError(
          "La presentación cambió mientras cargabas el precio. Cancelá esta carga y volvé a registrar el precio para el nuevo contenido.",
        );
        return;
      }
      operation.submit(url, {
        action: mode,
        requestId,
        presentationId,
        revision: pack.revision,
        price,
        quotedOn,
        validUntil: validUntil || null,
        leadTimeDays: leadTime === "" ? null : Number(leadTime),
        minimumPacks: Number(minimum),
      });
    }
  }
  let preview = "";
  if (mode === "presentation") {
    try {
      preview = quantity(
        presentationQuantity(units, content, unit),
        data?.item.baseUnit,
      );
    } catch {
      /* An incomplete input has no preview. */
    }
  }
  const field = (
    label: string,
    value: string,
    change: (value: string) => void,
    type = "text",
    required = true,
    hint?: string,
  ) => (
    <label className="block min-w-0 space-y-2 text-sm font-medium text-brand">
      <span>
        {label}
        {required ? " *" : ""}
      </span>
      <Input
        type={type}
        value={value}
        onChange={(e) => change(e.target.value)}
        onInput={
          type === "date" ? (e) => change(e.currentTarget.value) : undefined
        }
        required={required}
        inputMode={
          type === "text" && label !== "Nombre de la presentación"
            ? "decimal"
            : undefined
        }
      />
      {hint && (
        <span className="block text-xs font-normal leading-relaxed text-muted">
          {hint}
        </span>
      )}
    </label>
  );
  return (
    <div className="catalog-scroll-region min-h-0 flex-1 space-y-6 overflow-y-auto overscroll-contain px-2 pt-2 pb-3 [scrollbar-gutter:stable]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <p className="max-w-lg text-sm leading-relaxed text-muted">
          Vinculá todos los proveedores que venden este ingrediente. Podés
          cargar sus precios más adelante; no necesitan una cuenta en Kybo.
        </p>
        <Button
          type="button"
          variant="outline"
          disabled={locked || !canEdit || mode !== null}
          onClick={() => start("link")}
        >
          <Plus className="size-4" /> Vincular proveedor
        </Button>
      </div>
      {loading && (
        <p role="status" className="text-sm text-muted">
          Cargando proveedores…
        </p>
      )}
      {notice && (
        <p
          role="status"
          className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      {(error || operation.error) && (
        <div
          role="alert"
          className="space-y-2 rounded-xl bg-red-50 p-3 text-sm text-red-700"
        >
          <p>{error || operation.error}</p>
          {!operation.uncertain && (
            <Button
              type="button"
              variant="outline"
              onClick={() => void load()}
              disabled={locked}
            >
              Recargar datos
            </Button>
          )}
        </div>
      )}
      {operation.uncertain && (
        <Button
          type="button"
          variant="outline"
          disabled={operation.busy}
          onClick={operation.retry}
        >
          Reintentar el mismo envío
        </Button>
      )}
      {data && !canEdit && (
        <p className="text-sm text-muted">
          Para agregar proveedores, el ingrediente debe estar activo y marcado
          como comprado a proveedores.
        </p>
      )}
      {mode && (
        <form
          id={formId}
          onSubmit={submit}
          className="space-y-5 rounded-xl border border-blue-200 bg-blue-50/30 p-5 sm:p-6"
        >
          <h3 className="font-semibold text-brand">
            {mode === "link"
              ? "Vincular proveedor"
              : mode === "presentation"
                ? "Nueva presentación de compra"
                : `Registrar precio · ${pack?.name ?? ""}`}
          </h3>
          <fieldset
            disabled={locked}
            className="grid gap-x-6 gap-y-5 sm:grid-cols-2"
          >
            {mode === "link" ? (
              <div className="space-y-3 sm:col-span-2">
                <SearchSelect
                  entity="suppliers"
                  label="Proveedor"
                  value={supplierId}
                  onChange={setSupplierId}
                  filter={(r) => !data?.suppliers.some((s) => s.id === r.id)}
                  required
                />
                <p className="text-xs text-muted">
                  Si aún no existe,{" "}
                  <Link
                    className="text-blue underline"
                    href="/inventory/suppliers"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    crealo en Proveedores
                  </Link>{" "}
                  y buscá su nombre aquí.
                </p>
              </div>
            ) : mode === "presentation" ? (
              <>
                <div className="sm:col-span-2">
                  {field(
                    "Nombre de la presentación",
                    name,
                    setName,
                    "text",
                    true,
                    "Por ejemplo: Caja de 12 leches de 1 litro.",
                  )}
                </div>
                {field(
                  "Envases por presentación",
                  units,
                  setUnits,
                  "text",
                  true,
                  "Caja de 12: ingresá 12. Envase individual: ingresá 1.",
                )}
                {field("Contenido de cada envase", content, setContent)}
                <label className="space-y-2 text-sm font-medium text-brand">
                  <span>Unidad del contenido *</span>
                  <select
                    className="form-control"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value as typeof unit)}
                  >
                    {entryUnits
                      .filter((u) => baseUnit(u.value) === data?.item.baseUnit)
                      .map((u) => (
                        <option key={u.value} value={u.value}>
                          {u.label}
                        </option>
                      ))}
                  </select>
                </label>
                <p
                  aria-live="polite"
                  className="self-end rounded-lg bg-white p-3 text-sm text-brand"
                >
                  Contenido total:{" "}
                  <strong>{preview || "Completá las cantidades"}</strong>
                </p>
              </>
            ) : (
              <>
                {field(
                  "Precio final por presentación (ARS)",
                  price,
                  setPrice,
                  "text",
                  true,
                  "Incluí impuestos. No incluyas flete. Usá coma para decimales.",
                )}
                {field("Fecha del precio", quotedOn, setQuotedOn, "date")}
                {field(
                  "Válido hasta",
                  validUntil,
                  setValidUntil,
                  "date",
                  false,
                  "Dejá vacío si el proveedor no indicó una vigencia.",
                )}
                {field(
                  "Plazo de entrega (días)",
                  leadTime,
                  setLeadTime,
                  "number",
                  false,
                )}
                {field(
                  "Compra mínima (presentaciones)",
                  minimum,
                  setMinimum,
                  "number",
                )}
              </>
            )}
          </fieldset>
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={locked}
              onClick={() => setMode(null)}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={locked}>
              {operation.busy
                ? "Guardando…"
                : mode === "link"
                  ? "Vincular"
                  : "Guardar"}
            </Button>
          </div>
        </form>
      )}
      {data && !loading && data.suppliers.length === 0 && !mode && (
        <div className="rounded-xl border border-dashed border-line px-6 py-10 text-center">
          <Truck className="mx-auto mb-3 size-7 text-blue" />
          <h3 className="font-semibold text-brand">
            ¿A quién le comprás este ingrediente?
          </h3>
          <p className="mt-2 text-sm text-muted">
            Vinculá uno o varios proveedores para organizar las presentaciones y
            comparar sus precios.
          </p>
        </div>
      )}
      {data?.suppliers.map((vendor) => (
        <section
          key={vendor.id}
          className="overflow-hidden rounded-xl border border-line"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 bg-surface p-4">
            <h3 className="font-semibold text-brand">
              {vendor.name}
              {vendor.archived && (
                <span className="ml-2 text-xs text-muted">Archivado</span>
              )}
            </h3>
            <Button
              type="button"
              variant="outline"
              disabled={locked || !canEdit || vendor.archived || mode !== null}
              onClick={() => start("presentation", vendor.id)}
            >
              <Plus className="size-4" /> Agregar presentación
            </Button>
          </div>
          <div className="divide-y divide-line">
            {!data.presentations.some((p) => p.supplierId === vendor.id) && (
              <p className="p-4 text-sm text-muted">
                Proveedor vinculado. Todavía no cargaste presentaciones ni
                precios.
              </p>
            )}
            {data.presentations
              .filter((p) => p.supplierId === vendor.id)
              .map((p) => (
                <div key={p.id} className="space-y-3 p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h4 className="font-medium text-brand">
                        {p.name}
                        {p.archived && " · Archivada"}
                      </h4>
                      <p className="mt-1 text-xs text-muted">
                        {quantity(p.baseQuantity, data.item.baseUnit)} por
                        presentación
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        locked ||
                        !canEdit ||
                        p.archived ||
                        vendor.archived ||
                        mode !== null
                      }
                      onClick={() => start("quote", vendor.id, p.id)}
                    >
                      Registrar precio
                    </Button>
                  </div>
                  {p.quote ? (
                    <div className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
                      <div>
                        <p className="text-xs text-muted">
                          Precio final informado
                        </p>
                        <p className="mt-1 font-semibold text-brand">
                          {money(p.quote.price)}{" "}
                          <span className="font-normal text-muted">
                            por presentación
                          </span>
                        </p>
                        <p className="mt-1 text-blue">
                          {comparisonMoney.format(
                            Number(p.quote.comparison.amount),
                          )}{" "}
                          / {p.quote.comparison.unit}
                        </p>
                      </div>
                      <div className="text-xs leading-6 text-muted">
                        <p>Fecha del precio: {date(p.quote.quotedOn)}</p>
                        <p>
                          {p.quote.quotedOn > today()
                            ? "Precio con fecha futura"
                            : p.quote.validUntil
                              ? `${p.quote.validUntil < today() ? "Venció" : "Válido hasta"} el ${date(p.quote.validUntil)}`
                              : "Sin vigencia informada · confirmar con el proveedor"}
                        </p>
                        <p>
                          Mínimo: {p.quote.minimumPacks} presentación(es)
                          {p.quote.leadTimeDays !== null
                            ? ` · Entrega en ${p.quote.leadTimeDays} día(s)`
                            : " · Plazo a confirmar"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-muted">
                      Sin precio para esta presentación. Podés solicitarlo al
                      proveedor y registrarlo aquí.
                    </p>
                  )}
                </div>
              ))}
          </div>
        </section>
      ))}
      {!!data?.history.length && (
        <details className="rounded-xl border border-line p-4">
          <summary className="cursor-pointer text-sm font-semibold text-brand">
            Historial de precios · últimos {data.history.length}
          </summary>
          <ul className="mt-4 divide-y divide-line">
            {data.history.map((q) => (
              <li key={q.id} className="py-3 text-sm">
                <p className="font-medium text-brand">
                  {q.supplierName} · {q.presentationName}
                </p>
                <p className="mt-1 text-muted">
                  {date(q.quotedOn)} · {money(q.price)} por{" "}
                  {quantity(q.baseQuantity, q.baseUnit)} ·{" "}
                  {comparisonMoney.format(Number(q.comparison.amount))}/
                  {q.comparison.unit}
                </p>
              </li>
            ))}
          </ul>
        </details>
      )}
      <p className="text-xs leading-relaxed text-muted">
        Precios informados en pesos, con impuestos y sin flete. La comparación
        no contempla descuentos ni costos de entrega; confirmá vigencia y
        condiciones antes de pedir. Registrar una cotización no actualiza el
        costo del inventario.
      </p>
    </div>
  );
}
