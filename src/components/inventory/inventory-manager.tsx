"use client";
import { LocationSelect } from "@/components/branches/location-select";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  ChevronRight,
  History,
  Layers3,
  Package,
  Plus,
  Search,
  RefreshCw,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FieldCaption } from "@/components/ui/field-caption";
import { OperationAlert } from "@/components/ui/operation-alert";
import { OperationPanel } from "@/components/ui/operation-panel";
import { Tabs } from "@/components/ui/tabs";
import {
  stockQuantity,
  stockUnitCost,
  stockBaseQuantity,
} from "./stock-format";
import { useErrorFeedback } from "@/components/ui/use-error-feedback";
import {
  baseUnit,
  entryUnits,
  costUnitLabels,
} from "@/modules/catalog/entry-units";
import { decimal } from "@/modules/inventory/decimal";
import {
  openingQuantity,
  openingReferenceCost,
} from "@/modules/inventory/opening-quantity";
import type {
  AdjustmentInput,
  LotRow,
  MovementRow,
  StockResult,
  StockRow,
} from "@/modules/inventory/types";
import {
  date,
  getJson,
  money,
  quantity,
  SearchSelect,
  today,
  useOperation,
} from "./shared";

type Detail = {
  lots: { rows: LotRow[]; total: number };
  movements: { rows: MovementRow[]; total: number };
};
type Action = "opening" | "waste" | "count" | "block";
type OpeningOptions = {
  item: { id: string; baseUnit: string; unitCost: string | null };
  suppliers: { id: string; name: string; archived: boolean }[];
  presentations: {
    id: string;
    name: string;
    supplierId: string;
    revision: number;
    baseQuantity: string;
    archived: boolean;
  }[];
};
const actionLabels = {
  opening: "Ingreso manual",
  waste: "Registrar merma",
  count: "Registrar conteo",
  block: "Bloquear o desbloquear",
};
const kindLabels = {
  production_review: "Revisión del costo de producción",
  production: "Producción",
  sale_consume: "Preparación terminada",
  direct_dispatch: "Producto entregado",
  transfer: "Traslado",
  internal_use: "Consumo interno",
  return: "Devolución física",
  production_in: "Producción ingresada",
  production_out: "Consumo en producción",
  receipt: "Recepción",
  opening: "Ingreso manual",
  waste: "Merma",
  count: "Conteo",
};
function TextField({
  label,
  value,
  set,
  required,
  type = "text",
  disabled,
}: {
  label: string;
  value: string;
  set: (value: string) => void;
  required?: boolean;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="block min-w-0 text-sm font-semibold">
      <FieldCaption
        required={!disabled && required}
        optional={!disabled && !required}
      >
        {label}
      </FieldCaption>
      <Input
        className="mt-1"
        value={value}
        onChange={(event) => set(event.target.value)}
        onInput={
          type === "date"
            ? (event) => set(event.currentTarget.value)
            : undefined
        }
        required={required}
        type={type}
        disabled={disabled}
      />
    </label>
  );
}
function StockStatus({ row }: { row: StockRow }) {
  const expired = Number(row.expiredQuantity) > 0;
  const blocked = Number(row.blockedQuantity) > 0;
  return (
    <div className="flex flex-wrap gap-1.5">
      {Number(row.physicalQuantity) === 0 ? (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600">
          <span className="size-1.5 rounded-full bg-current" />
          Sin stock
        </span>
      ) : Number(row.usableQuantity) === 0 ? (
        <span className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-900">
          Sin stock utilizable
        </span>
      ) : !expired && !blocked ? (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700">
          <span className="size-1.5 rounded-full bg-current" />
          Utilizable
        </span>
      ) : null}
      {expired && (
        <span className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600">
          Vencido {stockQuantity(row.expiredQuantity, row.baseUnit)}
        </span>
      )}
      {blocked && (
        <span className="rounded-lg bg-orange-50 px-2.5 py-1.5 text-xs font-medium text-orange-700">
          Bloqueado {stockQuantity(row.blockedQuantity, row.baseUnit)}
        </span>
      )}
    </div>
  );
}
export function InventoryManager({
  actorId,
  timeZone,
}: {
  actorId: string;
  timeZone: string;
}) {
  const [stock, setStock] = useState<StockResult | null>(null),
    [search, setSearch] = useState(""),
    [error, setError, errorAttempt] = useErrorFeedback(),
    [detailError, setDetailError, detailErrorAttempt] = useErrorFeedback();
  const adjustmentFormId = useId();
  const adjustmentForm = useRef<HTMLFormElement>(null);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const searchField = useRef<HTMLInputElement>(null);
  const detailOpener = useRef<HTMLElement | null>(null);
  const [stockLoading, setStockLoading] = useState(true),
    [detailLoading, setDetailLoading] = useState(false),
    [detailTab, setDetailTab] = useState("lots");
  const [selected, setSelected] = useState<StockRow | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [lotOffset, setLotOffset] = useState(0),
    [movementOffset, setMovementOffset] = useState(0);
  const [action, setAction] = useState<Action | null>(null),
    [lot, setLot] = useState<LotRow | null>(null),
    [itemId, setItemId] = useState(""),
    [locationId, setLocationId] = useState(""),
    [receivedOn, setReceivedOn] = useState(today(timeZone));
  useEffect(() => {
    if (selected) {
      detailHeading.current?.focus({ preventScroll: true });
      detailHeading.current?.scrollIntoView({ block: "start" });
    }
  }, [selected]);
  const [expiresOn, setExpiresOn] = useState(""),
    [lotCode, setLotCode] = useState(""),
    [quantityInput, setQuantityInput] = useState(""),
    [costOverride, setCostOverride] = useState<string | undefined>(undefined),
    [reason, setReason] = useState("");
  const [blocked, setBlocked] = useState(false),
    [notice, setNotice] = useState("");
  const stockRequest = useRef(0);
  const [openingOptions, setOpeningOptions] = useState<OpeningOptions | null>(
    null,
  );
  const [entryChoice, setEntryChoice] = useState("");
  const [optionsError, setOptionsError, optionsErrorAttempt] =
    useErrorFeedback();
  const [optionsVersion, setOptionsVersion] = useState(0);
  useEffect(() => {
    if (action !== "opening" || !itemId) return;
    let live = true;
    getJson<OpeningOptions>(`/api/items/${itemId}/suppliers`)
      .then((data) => {
        if (!live) return;
        setOpeningOptions(data);
        setEntryChoice(
          data.item.baseUnit === "ml"
            ? "l"
            : data.item.baseUnit === "g"
              ? "kg"
              : "unit",
        );
        setOptionsError("");
      })
      .catch(() => {
        if (live)
          setOptionsError(
            "No pudimos cargar las unidades y presentaciones. Reintentá la carga.",
          );
      });
    return () => {
      live = false;
    };
  }, [action, itemId, optionsVersion, setOptionsError]);
  const openingReady = openingOptions?.item.id === itemId && !!entryChoice;
  const chosenPack = openingOptions?.presentations.find(
    (p) => `pack:${p.id}` === entryChoice,
  );
  const openingFactor =
    chosenPack?.baseQuantity ??
    (entryChoice === "l" || entryChoice === "kg" ? "1000.000000" : "1.000000");
  const suggestedCost = openingReady
    ? openingReferenceCost(openingOptions!.item.unitCost, openingFactor)
    : "";
  const unitCost = costOverride ?? suggestedCost;
  let openingPreview = "";
  if (openingReady && quantityInput.trim()) {
    try {
      const converted = openingQuantity(
        decimal(quantityInput, 6, true, true)!,
        decimal(unitCost.trim(), 6, false),
        chosenPack?.baseQuantity ??
          (entryChoice === "l" || entryChoice === "kg"
            ? "1000.000000"
            : "1.000000"),
      );
      openingPreview = `Ingresarán ${quantity(converted.quantity, openingOptions!.item.baseUnit)}. ${converted.value === null ? "Costo pendiente." : `Valor total: ${money(converted.value)}.`}`;
    } catch (error) {
      openingPreview =
        error instanceof Error
          ? error.message
          : "Revisá la cantidad y el costo.";
    }
  }
  const detailRequest = useRef(0);
  const loadStock = useCallback(async () => {
    const sequence = ++stockRequest.current;
    setStockLoading(true);
    try {
      const result = await getJson<StockResult>(
        `/api/inventory?q=${encodeURIComponent(search)}`,
      );
      if (sequence !== stockRequest.current) return false;
      setStock(result);
      setError("");
      return true;
    } catch {
      if (sequence === stockRequest.current)
        setError("No pudimos cargar el inventario. Probá de nuevo.");
      return false;
    } finally {
      if (sequence === stockRequest.current) setStockLoading(false);
    }
  }, [search, setError]);
  useEffect(() => {
    const timer = setTimeout(() => void loadStock(), search ? 250 : 0);
    return () => {
      clearTimeout(timer);
      // Request counter, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      stockRequest.current++;
    };
  }, [loadStock, search]);
  const loadDetail = useCallback(
    async (id: string, lots = lotOffset, movements = movementOffset) => {
      const sequence = ++detailRequest.current;
      setDetailLoading(true);
      setDetailError("");
      try {
        const result = await getJson<Detail>(
          `/api/inventory/${id}?lotOffset=${lots}&movementOffset=${movements}`,
        );
        if (sequence !== detailRequest.current) return false;
        setDetail(result);
        setDetailError("");
        return true;
      } catch {
        if (sequence === detailRequest.current)
          setDetailError(
            "No pudimos actualizar los lotes y movimientos. Probá de nuevo.",
          );
        return false;
      } finally {
        if (sequence === detailRequest.current) setDetailLoading(false);
      }
    },
    [lotOffset, movementOffset, setDetailError],
  );
  useEffect(() => {
    if (!selected) return;
    const timer = setTimeout(() => void loadDetail(selected.itemId), 0);
    return () => {
      clearTimeout(timer);
      // Request counter, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      detailRequest.current++;
    };
  }, [selected, lotOffset, movementOffset, loadDetail]);
  const onAdjusted = useCallback(async () => {
    setAction(null);
    setLot(null);
    setItemId("");
    const [stockOk, detailOk] = await Promise.all([
      loadStock(),
      selected ? loadDetail(selected.itemId) : Promise.resolve(true),
    ]);
    setNotice(
      stockOk && detailOk
        ? "Movimiento confirmado."
        : "Movimiento confirmado. No pudimos actualizar toda la vista; recargá para ver el saldo actual.",
    );
  }, [loadStock, loadDetail, selected]);
  const operation = useOperation<AdjustmentInput>(actorId, "adjustment", () => {
    void onAdjusted();
  });
  function openAction(kind: Action, row?: LotRow) {
    if (
      operation.locked ||
      (kind !== "opening" && (detailLoading || detailError))
    )
      return;
    setAction(kind);
    setLot(row || null);
    setItemId(selected?.itemId || "");
    setOpeningOptions(null);
    setEntryChoice("");
    setOptionsError("");
    setReceivedOn(today(timeZone));
    setExpiresOn("");
    setLotCode("");
    setQuantityInput("");
    setCostOverride(undefined);
    setReason("");
    setBlocked(row ? !row.blocked : false);
    operation.clearError();
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!action) return;
    if (action === "opening" && !openingReady) return;
    const requestId = crypto.randomUUID();
    let input: AdjustmentInput;
    if (action === "opening")
      input = {
        requestId,
        kind: "opening",
        locationId,
        itemId,
        ...(chosenPack
          ? {
              presentationId: chosenPack.id,
              presentationRevision: chosenPack.revision,
            }
          : { entryUnit: entryChoice as "l" | "ml" | "kg" | "g" | "unit" }),
        quantity: quantityInput,
        unitCost: unitCost.trim() || null,
        receivedOn,
        expiresOn: expiresOn || null,
        lotCode: lotCode.trim() || null,
        observations: reason.trim(),
      };
    else if (lot && action === "waste")
      input = {
        requestId,
        kind: "waste",
        locationId: lot!.locationId,
        lotId: lot.id,
        revision: lot.revision,
        quantity: quantityInput,
        reason,
      };
    else if (lot && action === "count")
      input = {
        requestId,
        kind: "count",
        locationId: lot!.locationId,
        lotId: lot.id,
        revision: lot.revision,
        countedQuantity: quantityInput,
        reason,
      };
    else if (lot)
      input = {
        requestId,
        kind: "block",
        locationId: lot!.locationId,
        lotId: lot.id,
        revision: lot.revision,
        blocked,
        reason,
      };
    else return;
    operation.submit("/api/inventory/adjustments", input);
  }
  const select = (row: StockRow, opener: HTMLElement) => {
    if (operation.locked || stockLoading || error) return;
    detailOpener.current = opener;
    detailRequest.current++;
    setSelected(row);
    setLotOffset(0);
    setMovementOffset(0);
    setDetail(null);
    setAction(null);
    setNotice("");
    setDetailTab("lots");
  };
  function closeDetail() {
    if (operation.locked) return;
    detailRequest.current++;
    setSelected(null);
    setDetail(null);
    if (detailOpener.current?.isConnected)
      detailOpener.current.focus({ preventScroll: true });
    else searchField.current?.focus({ preventScroll: true });
  }
  const visibleRows = stock?.rows ?? [];
  const usableCount = visibleRows.filter(
    (row) => Number(row.usableQuantity) > 0,
  ).length;
  const restrictedCount = visibleRows.filter(
    (row) => Number(row.expiredQuantity) > 0 || Number(row.blockedQuantity) > 0,
  ).length;
  const summaryScope = stock
    ? `En los ${stock.rows.length} artículos mostrados`
    : "Cargando inventario";
  return (
    <div className="space-y-6">
      <header className="page-heading">
        <div>
          <h1 className="page-title">Stock actual</h1>
          <p className="page-description">
            Stock, lotes y movimientos de tus artículos en un solo lugar.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            disabled={stockLoading || operation.locked}
            onClick={() => void loadStock()}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Actualizar inventario
          </Button>
          <Button
            type="button"
            onClick={() => openAction("opening")}
            disabled={operation.locked}
          >
            <Plus aria-hidden="true" />
            Ingreso manual
          </Button>
        </div>
      </header>
      {!action && (
        <OperationAlert
          title="No pudimos completar el ajuste de inventario"
          message={operation.error}
          eventKey={operation.errorAttempt}
          tone="error"
        />
      )}
      {operation.uncertain && (
        <Card className="gap-3 border-amber-200 bg-amber-50 p-5" role="status">
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="mt-0.5 size-5 shrink-0 text-amber-600"
              aria-hidden="true"
            />
            <div>
              <strong className="text-brand">
                Ajuste pendiente de confirmar
              </strong>
              <p className="mt-1 text-sm text-amber-900">
                Reintentá el mismo envío para confirmar el resultado antes de
                registrar otra operación.
              </p>
            </div>
          </div>
          <Button
            type="button"
            className="self-start"
            disabled={operation.busy}
            onClick={operation.retry}
          >
            Reintentar el mismo envío
          </Button>
        </Card>
      )}
      {notice && (
        <p
          role="status"
          className="flex items-start gap-2 rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm text-emerald-800"
        >
          <CheckCircle2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {notice}
        </p>
      )}
      <section aria-label="Resumen del inventario" className="space-y-2">
        <dl className="grid divide-y divide-line rounded-xl border border-line bg-white px-4 sm:grid-cols-3 sm:divide-x sm:divide-y-0 sm:px-0">
          {[
            [
              search ? "Artículos encontrados" : "Artículos en inventario",
              stock?.total,
            ],
            ["Con stock utilizable", stock ? usableCount : undefined],
            ["Con vencidos o bloqueados", stock ? restrictedCount : undefined],
          ].map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between gap-4 py-4 sm:block sm:px-5"
            >
              <dt className="text-sm text-muted">{label}</dt>
              <dd className="text-xl font-bold tabular-nums text-brand sm:mt-1">
                {value ?? "—"}
              </dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted">
          {stockLoading
            ? "Actualizando inventario…"
            : error
              ? "La consulta no está actualizada."
              : summaryScope}
        </p>
      </section>
      <section className="@container space-y-4" aria-label="Stock por artículo">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line">
          <h2 className="inline-flex items-center gap-2 py-3 text-lg font-bold text-brand">
            Artículos
            <span className="rounded-md bg-[#eaf4ff] px-1.5 py-0.5 text-xs">
              {stock?.total ?? "—"}
            </span>
          </h2>
          {stock && (
            <p className="pb-2 text-xs text-muted">
              Corte {date(stock.businessDate)}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="relative block w-full sm:max-w-md">
            <span className="sr-only">Buscar artículo</span>
            <Search
              className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-muted"
              aria-hidden="true"
            />
            <Input
              type="search"
              ref={searchField}
              className="min-h-12 bg-white pl-11"
              value={search}
              onChange={(event) => {
                setStockLoading(true);
                setSearch(event.target.value);
              }}
              placeholder="Buscar artículo…"
            />
          </label>
          <p className="text-xs text-muted">
            Cantidades en litros, kilos o unidades. Utilizable excluye reservas,
            vencidos y bloqueos.
          </p>
        </div>
        <OperationAlert
          title="No pudimos cargar el inventario"
          message={error}
          eventKey={errorAttempt}
          tone="error"
        />
        {error && (
          <p
            role="alert"
            className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"
          >
            {error} Usá «Actualizar inventario» para volver a consultar.{" "}
            {stock && "Se conservan los últimos datos consultados."}
          </p>
        )}
        <Card className="@container gap-0 overflow-hidden p-0">
          {!stock ? (
            <p role="status" className="p-8 text-center text-sm text-muted">
              {stockLoading
                ? "Cargando inventario…"
                : "Reintentá la consulta para ver las existencias."}
            </p>
          ) : stock.rows.length ? (
            <div className="overflow-x-auto">
              <table className="block w-full text-left text-sm @[920px]:table">
                <caption className="sr-only">
                  Existencias, costo y estado de cada artículo
                </caption>
                <thead className="hidden bg-[#f9fbfe] text-xs font-medium text-muted @[920px]:table-header-group">
                  <tr>
                    <th scope="col" className="px-5 py-4 font-medium">
                      Insumo
                    </th>
                    <th scope="col" className="px-4 py-4 font-medium">
                      Stock físico
                    </th>
                    <th scope="col" className="px-4 py-4 font-medium">
                      Utilizable
                    </th>
                    <th scope="col" className="px-4 py-4 font-medium">
                      Valor y costo
                    </th>
                    <th scope="col" className="px-4 py-4 font-medium">
                      Estado
                    </th>
                    <th scope="col" className="w-14 px-4 py-4">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="block divide-y divide-line @[920px]:table-row-group">
                  {stock.rows.map((row) => (
                    <tr
                      key={row.itemId}
                      className={`grid grid-cols-2 items-center gap-x-4 gap-y-4 p-4 transition-colors @[920px]:table-row @[920px]:p-0 ${selected?.itemId === row.itemId ? "bg-[#f0f7ff]" : "hover:bg-[#fafcff]"}`}
                    >
                      <td className="col-span-2 block min-w-0 @[920px]:table-cell @[920px]:px-5 @[920px]:py-4">
                        <div className="flex items-center gap-3">
                          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#f0f5fa] text-[#6481a6]">
                            <Package className="size-5" aria-hidden="true" />
                          </span>
                          <div className="min-w-0">
                            <p className="font-semibold text-brand">
                              {row.name}
                            </p>
                            {row.archived && (
                              <span className="text-xs text-muted">
                                Archivado
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="block @[920px]:table-cell @[920px]:px-4 @[920px]:py-4">
                        <span className="mb-1 block text-xs text-muted @[920px]:hidden">
                          Stock físico
                        </span>
                        <p className="whitespace-nowrap font-medium text-brand">
                          {stockQuantity(row.physicalQuantity, row.baseUnit)}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          Sin fecha:{" "}
                          {stockQuantity(row.undatedQuantity, row.baseUnit)}
                        </p>
                      </td>
                      <td className="block @[920px]:table-cell @[920px]:px-4 @[920px]:py-4">
                        <span className="mb-1 block text-xs text-muted @[920px]:hidden">
                          Utilizable
                        </span>
                        <p className="whitespace-nowrap font-semibold text-brand">
                          {stockQuantity(row.usableQuantity, row.baseUnit)}
                        </p>
                      </td>
                      <td className="col-span-2 block @[920px]:table-cell @[920px]:px-4 @[920px]:py-4">
                        <span className="mb-1 block text-xs text-muted @[920px]:hidden">
                          Valor y costo
                        </span>
                        <p className="whitespace-nowrap font-medium text-brand">
                          {money(row.stockValue)}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          Promedio{" "}
                          {stockUnitCost(row.averageCost, row.baseUnit)}
                        </p>
                      </td>
                      <td className="block @[920px]:table-cell @[920px]:px-4 @[920px]:py-4">
                        <StockStatus row={row} />
                      </td>
                      <td className="block text-right @[920px]:table-cell @[920px]:px-4 @[920px]:py-4">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-blue"
                          onClick={(event) => select(row, event.currentTarget)}
                          disabled={stockLoading || !!error || operation.locked}
                          aria-label={`Ver lotes de ${row.name}`}
                        >
                          Ver lotes
                          <ChevronRight className="size-4" aria-hidden="true" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : !error && !stockLoading ? (
            <div className="flex flex-col items-center gap-2 px-5 py-12 text-center">
              <span className="mb-2 flex size-14 items-center justify-center rounded-2xl bg-[#eaf4ff] text-blue">
                <Package className="size-7" aria-hidden="true" />
              </span>
              <p className="font-semibold text-brand">
                No hay stock para mostrar.
              </p>
              <p className="text-sm text-muted">
                {search
                  ? "Probá con otro nombre de artículo."
                  : "Los ingresos y recepciones aparecerán acá."}
              </p>
            </div>
          ) : null}
          {stock && (
            <div className="border-t border-line px-5 py-4 text-xs text-muted">
              {stock.rows.length} de {stock.total} artículos
              {stock.total > stock.rows.length
                ? " · Refiná la búsqueda para ver más resultados."
                : ""}
            </div>
          )}
        </Card>
      </section>
      {selected && (
        <section
          className="space-y-4"
          aria-label={`Detalle de ${selected.name}`}
        >
          <Card className="@container gap-0 overflow-hidden p-0">
            <div className="flex items-start justify-between gap-4 border-b border-line p-5">
              <div>
                <h2
                  ref={detailHeading}
                  tabIndex={-1}
                  className="scroll-mt-24 text-xl font-bold text-brand outline-none"
                >
                  {selected.name}
                </h2>
                <p className="mt-1 text-sm text-muted">
                  Lotes por vencimiento y trazabilidad de cada movimiento.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Cerrar detalle"
                onClick={closeDetail}
                disabled={operation.locked}
              >
                <X className="size-5" aria-hidden="true" />
              </Button>
            </div>
            {detailError && (
              <div className="m-5">
                <OperationAlert
                  title="No pudimos cargar el detalle del inventario"
                  message={detailError}
                  eventKey={detailErrorAttempt}
                  tone="error"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3"
                  onClick={() => void loadDetail(selected.itemId)}
                >
                  Reintentar cargar detalle
                </Button>
              </div>
            )}
            <Tabs.Root value={detailTab} onValueChange={setDetailTab}>
              <Tabs.List
                aria-label="Detalle del inventario"
                className="mx-5 mt-3"
              >
                <Tabs.Trigger value="lots" disabled={operation.locked}>
                  Lotes
                </Tabs.Trigger>
                <Tabs.Trigger value="movements" disabled={operation.locked}>
                  Movimientos
                </Tabs.Trigger>
              </Tabs.List>
              {detailLoading && (
                <p role="status" className="px-5 pt-4 text-sm text-muted">
                  Actualizando lotes y movimientos…
                </p>
              )}
              <Tabs.Content
                value="lots"
                forceMount
                hidden={detailTab !== "lots"}
              >
                <div className="flex items-center justify-between gap-3 px-5 pt-5 pb-3">
                  <h3 className="flex items-center gap-2 font-bold text-brand">
                    <Layers3 className="size-4 text-blue" aria-hidden="true" />
                    Lotes
                  </h3>
                  {detail && (
                    <span className="text-xs text-muted">
                      {detail.lots.total} en total
                    </span>
                  )}
                </div>
                <p className="px-5 pb-4 text-xs text-muted">
                  Los lotes sin fecha de vencimiento aparecen al final.
                </p>
                {!detail ? (
                  !detailError && (
                    <p role="status" className="px-5 pb-5 text-sm text-muted">
                      Cargando lotes y movimientos…
                    </p>
                  )
                ) : detail.lots.rows.length ? (
                  <div className="overflow-x-auto">
                    <table className="block w-full text-left text-sm @[920px]:table">
                      <caption className="sr-only">
                        Lotes de {selected.name}
                      </caption>
                      <thead className="hidden bg-[#f9fbfe] text-xs text-muted @[920px]:table-header-group">
                        <tr>
                          <th scope="col" className="px-5 py-3 font-medium">
                            Lote / ingreso
                          </th>
                          <th scope="col" className="px-4 py-3 font-medium">
                            Vencimiento
                          </th>
                          <th scope="col" className="px-4 py-3 font-medium">
                            Cantidad física
                          </th>
                          <th
                            scope="col"
                            className="px-5 py-3 text-right font-medium"
                          >
                            Acciones
                          </th>
                        </tr>
                      </thead>
                      <tbody className="block divide-y divide-line @[920px]:table-row-group">
                        {detail.lots.rows.map((item) => (
                          <tr
                            key={`${item.id}:${item.locationId}`}
                            className="grid grid-cols-2 gap-3 p-5 @[920px]:table-row @[920px]:p-0"
                          >
                            <td className="block @[920px]:table-cell @[920px]:px-5 @[920px]:py-4">
                              <h4 className="font-semibold text-brand">
                                {item.lotCode || "Sin código"}
                                <span className="block text-xs text-muted">
                                  {item.locationName} · reservado:{" "}
                                  {stockQuantity(
                                    item.reservedQuantity,
                                    item.baseUnit,
                                  )}
                                </span>
                              </h4>
                              <p className="mt-1 text-xs text-muted">
                                Recibido {date(item.receivedOn)}
                              </p>
                              {item.blocked && (
                                <Badge variant="secondary" className="mt-2">
                                  Bloqueado
                                </Badge>
                              )}
                            </td>
                            <td className="block @[920px]:table-cell @[920px]:px-4 @[920px]:py-4">
                              <p className="mb-1 text-xs text-muted @[920px]:hidden">
                                Vencimiento
                              </p>
                              <p
                                className={
                                  item.expired
                                    ? "font-medium text-red-600"
                                    : "text-muted"
                                }
                              >
                                {item.expiresOn
                                  ? date(item.expiresOn)
                                  : "Sin fecha"}
                              </p>
                              {item.expired && (
                                <Badge variant="destructive" className="mt-2">
                                  Vencido
                                </Badge>
                              )}
                            </td>
                            <td className="col-span-2 block @[920px]:table-cell @[920px]:px-4 @[920px]:py-4">
                              <p className="mb-1 text-xs text-muted @[920px]:hidden">
                                Cantidad física
                              </p>
                              <p className="whitespace-nowrap font-semibold text-brand">
                                {stockQuantity(
                                  item.remainingQuantity,
                                  item.baseUnit,
                                )}
                              </p>
                              <p className="mt-1 text-xs text-muted">
                                Original{" "}
                                {quantity(item.initialQuantity, item.baseUnit)}
                              </p>
                            </td>
                            <td className="col-span-2 block @[920px]:table-cell @[920px]:px-5 @[920px]:py-4">
                              <div className="flex flex-wrap gap-2 @[920px]:justify-end">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openAction("waste", item)}
                                  disabled={
                                    operation.locked ||
                                    Number(item.remainingQuantity) === 0
                                  }
                                >
                                  Registrar merma
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openAction("count", item)}
                                  disabled={
                                    operation.locked ||
                                    detailLoading ||
                                    !!detailError
                                  }
                                >
                                  Registrar conteo
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => openAction("block", item)}
                                  disabled={
                                    operation.locked ||
                                    detailLoading ||
                                    !!detailError
                                  }
                                >
                                  {item.blocked ? "Desbloquear" : "Bloquear"}
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="px-5 pb-5 text-sm text-muted">Sin lotes.</p>
                )}
                {detail && detail.lots.total > 100 && (
                  <div className="flex flex-wrap justify-end gap-2 border-t border-line p-4">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        lotOffset === 0 || detailLoading || operation.locked
                      }
                      onClick={() => {
                        setDetailLoading(true);
                        setLotOffset(Math.max(0, lotOffset - 100));
                      }}
                    >
                      Lotes anteriores
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        detailLoading ||
                        operation.locked ||
                        lotOffset + detail.lots.rows.length >= detail.lots.total
                      }
                      onClick={() => {
                        setDetailLoading(true);
                        setLotOffset(lotOffset + 100);
                      }}
                    >
                      Más lotes
                    </Button>
                  </div>
                )}
              </Tabs.Content>
              <Tabs.Content
                value="movements"
                forceMount
                hidden={detailTab !== "movements"}
              >
                <div className="mt-2 flex items-center justify-between gap-3 border-t border-line px-5 pt-5 pb-4">
                  <h3 className="flex items-center gap-2 font-bold text-brand">
                    <History className="size-4 text-blue" aria-hidden="true" />
                    Movimientos
                  </h3>
                  {detail && (
                    <span className="text-xs text-muted">
                      {detail.movements.total} en total
                    </span>
                  )}
                </div>
                {detail?.movements.rows.length ? (
                  <div className="divide-y divide-line">
                    {detail.movements.rows.map((item) => (
                      <article
                        key={item.id}
                        className="flex gap-3 px-5 py-4 text-sm"
                      >
                        <span
                          className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${Number(item.delta) < 0 ? "bg-orange-50 text-orange-600" : "bg-[#eaf4ff] text-blue"}`}
                        >
                          <ArrowLeftRight
                            className="size-4"
                            aria-hidden="true"
                          />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                            <p className="font-semibold text-brand">
                              {kindLabels[item.kind]}{" "}
                              <span className="ml-1 whitespace-nowrap">
                                {stockQuantity(item.delta, selected.baseUnit)}
                              </span>
                            </p>
                            <time
                              dateTime={item.createdAt}
                              className="text-xs text-muted"
                            >
                              {new Intl.DateTimeFormat("es-AR", {
                                dateStyle: "short",
                                timeStyle: "short",
                                timeZone,
                              }).format(new Date(item.createdAt))}
                            </time>
                          </div>
                          <p className="mt-1 text-muted">
                            {item.reason || "Sin motivo"}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            {item.actorName} · Costo aplicado{" "}
                            {money(item.valueDelta)}
                          </p>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : !detailError ? (
                  <p className="px-5 pb-5 text-sm text-muted">
                    {detail ? "Sin movimientos." : "Cargando movimientos…"}
                  </p>
                ) : null}
                {detail && detail.movements.total > 100 && (
                  <div className="flex flex-wrap justify-end gap-2 border-t border-line p-4">
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        movementOffset === 0 ||
                        detailLoading ||
                        operation.locked
                      }
                      onClick={() => {
                        setDetailLoading(true);
                        setMovementOffset(Math.max(0, movementOffset - 100));
                      }}
                    >
                      Movimientos anteriores
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={
                        detailLoading ||
                        operation.locked ||
                        movementOffset + detail.movements.rows.length >=
                          detail.movements.total
                      }
                      onClick={() => {
                        setDetailLoading(true);
                        setMovementOffset(movementOffset + 100);
                      }}
                    >
                      Más movimientos
                    </Button>
                  </div>
                )}
              </Tabs.Content>
            </Tabs.Root>
          </Card>
        </section>
      )}
      {action && (
        <OperationPanel
          title={actionLabels[action]}
          size={action === "opening" ? "wide" : "default"}
          description={
            action === "opening"
              ? "Registrá un ingreso con su ubicación y motivo. El costo puede quedar pendiente."
              : `${lot?.itemName} · ${lot?.locationName} · lote ${lot?.lotCode || "Sin código"} · físico ${lot ? stockBaseQuantity(lot.remainingQuantity, lot.baseUnit) : ""}`
          }
          locked={operation.locked}
          onOpenAutoFocus={(event) => {
            const first = adjustmentForm.current?.querySelector<HTMLElement>(
              'input:not(:disabled):not([type="hidden"]), select:not(:disabled), textarea:not(:disabled)',
            );
            if (first) {
              event.preventDefault();
              first.focus();
            }
          }}
          onClose={() => setAction(null)}
          footer={
            <>
              <Button
                type="button"
                className="min-h-12"
                variant="outline"
                disabled={operation.locked}
                onClick={() => setAction(null)}
              >
                Cancelar
              </Button>
              {operation.uncertain ? (
                <Button
                  type="button"
                  className="min-h-12"
                  disabled={operation.busy}
                  onClick={operation.retry}
                >
                  Reintentar desde este formulario
                </Button>
              ) : (
                <Button
                  type="submit"
                  form={adjustmentFormId}
                  className="min-h-12"
                  disabled={
                    operation.locked || (action === "opening" && !openingReady)
                  }
                >
                  {action === "opening"
                    ? "Confirmar ingreso"
                    : action === "waste"
                      ? "Confirmar merma"
                      : action === "count"
                        ? "Confirmar conteo"
                        : "Confirmar cambio"}
                </Button>
              )}
            </>
          }
        >
          <form
            ref={adjustmentForm}
            id={adjustmentFormId}
            onSubmit={submit}
            className="space-y-6"
          >
            {action === "opening" && (
              <LocationSelect
                value={locationId}
                onChange={setLocationId}
                disabled={operation.locked}
              />
            )}
            <fieldset
              disabled={operation.locked}
              className="grid gap-x-8 gap-y-6 sm:grid-cols-2"
            >
              {action === "opening" && (
                <>
                  <SearchSelect
                    entity="items"
                    label="Artículo o ingrediente"
                    value={itemId}
                    onChange={(id) => {
                      setItemId(id);
                      setOpeningOptions(null);
                      setEntryChoice("");
                      setQuantityInput("");
                      setCostOverride(undefined);
                      setOptionsError("");
                    }}
                    required
                  />
                  <TextField
                    label="Fecha de ingreso"
                    type="date"
                    value={receivedOn}
                    set={setReceivedOn}
                    required
                  />
                  <TextField
                    label="Código de lote"
                    value={lotCode}
                    set={setLotCode}
                  />
                  <TextField
                    label="Vencimiento"
                    type="date"
                    value={expiresOn}
                    set={setExpiresOn}
                  />
                  <div className="min-w-0 text-sm font-semibold">
                    <label htmlFor="opening-entry-unit">
                      <FieldCaption required={openingReady}>
                        Cargar cantidad en
                      </FieldCaption>
                    </label>
                    <select
                      id="opening-entry-unit"
                      className="form-control mt-2"
                      value={entryChoice}
                      required
                      disabled={!openingReady}
                      onChange={(event) => {
                        setEntryChoice(event.target.value);
                        setQuantityInput("");
                        setCostOverride(undefined);
                      }}
                    >
                      <option value="">
                        {itemId
                          ? "Cargando unidades…"
                          : "Elegí un artículo primero"}
                      </option>
                      {openingOptions?.item.id === itemId && (
                        <>
                          <optgroup label="Unidades de medida">
                            {entryUnits
                              .filter(
                                (u) =>
                                  baseUnit(u.value) ===
                                  openingOptions.item.baseUnit,
                              )
                              .map((u) => (
                                <option key={u.value} value={u.value}>
                                  {u.label}
                                </option>
                              ))}
                          </optgroup>
                          <optgroup label="Presentaciones de compra">
                            {openingOptions.presentations
                              .filter((p) => !p.archived)
                              .map((p) => (
                                <option key={p.id} value={`pack:${p.id}`}>
                                  {p.name} ·{" "}
                                  {
                                    openingOptions.suppliers.find(
                                      (s) => s.id === p.supplierId,
                                    )?.name
                                  }
                                </option>
                              ))}
                          </optgroup>
                        </>
                      )}
                    </select>
                    {openingReady && (
                      <Button
                        className="mt-2"
                        type="button"
                        variant="ghost"
                        disabled={operation.locked}
                        onClick={() => {
                          setOpeningOptions(null);
                          setEntryChoice("");
                          setQuantityInput("");
                          setCostOverride(undefined);
                          setOptionsVersion((v) => v + 1);
                        }}
                      >
                        Actualizar presentaciones
                      </Button>
                    )}
                  </div>
                  <div>
                    <TextField
                      label={
                        chosenPack
                          ? "Costo por presentación"
                          : `Costo por ${costUnitLabels[entryChoice] ?? "unidad elegida"}`
                      }
                      value={unitCost}
                      set={setCostOverride}
                      disabled={!openingReady}
                    />
                    <p className="mt-2 text-xs text-muted">
                      {costOverride === undefined && suggestedCost !== ""
                        ? "Tomado del catálogo. Podés modificarlo si esta mercadería tuvo otro costo."
                        : "Costo de este ingreso; no modifica el catálogo. Dejalo vacío si no lo sabés."}
                    </p>
                  </div>
                  {chosenPack && (
                    <p className="text-sm text-muted sm:col-span-2">
                      Cada presentación contiene{" "}
                      {quantity(
                        chosenPack.baseQuantity,
                        openingOptions!.item.baseUnit,
                      )}
                      .
                    </p>
                  )}
                </>
              )}
              {action !== "block" && (
                <TextField
                  label={
                    action === "waste"
                      ? `Cantidad a descartar (${lot?.baseUnit === "unit" ? "unidades" : lot?.baseUnit})`
                      : action === "count"
                        ? `Cantidad contada (${lot?.baseUnit === "unit" ? "unidades" : lot?.baseUnit})`
                        : chosenPack
                          ? "Cantidad de presentaciones"
                          : `Cantidad (${entryChoice || "unidad elegida"})`
                  }
                  value={quantityInput}
                  set={setQuantityInput}
                  required
                />
              )}
              {action === "block" && (
                <label className="block text-sm font-semibold">
                  <FieldCaption required>Estado</FieldCaption>
                  <select
                    required
                    className="form-control mt-1"
                    value={blocked ? "1" : "0"}
                    onChange={(event) => setBlocked(event.target.value === "1")}
                  >
                    <option value="1">Bloqueado</option>
                    <option value="0">Sin bloqueo manual</option>
                  </select>
                </label>
              )}
              <TextField
                label={action === "opening" ? "Observaciones" : "Motivo"}
                value={reason}
                set={setReason}
                required={action !== "opening"}
              />
            </fieldset>
            {action === "opening" && optionsError && (
              <div>
                <OperationAlert
                  title="No pudimos cargar las unidades y presentaciones"
                  message={optionsError}
                  eventKey={optionsErrorAttempt}
                  tone="error"
                />
                <Button
                  type="button"
                  variant="outline"
                  disabled={operation.locked}
                  onClick={() => {
                    setOptionsError("");
                    setOptionsVersion((v) => v + 1);
                  }}
                >
                  Reintentar carga
                </Button>
              </div>
            )}
            {action === "opening" && openingPreview && (
              <p
                aria-live="polite"
                className="rounded-lg bg-blue-50 p-4 text-sm text-brand"
              >
                {openingPreview}
              </p>
            )}
            <p className="text-xs text-muted">
              Se registrará la diferencia y la persona responsable. Los lotes
              vencidos o bloqueados siguen en el físico hasta registrar merma.
            </p>
            <OperationAlert
              title="No pudimos completar el ajuste de inventario"
              message={operation.error}
              eventKey={operation.errorAttempt}
              tone="error"
            />
          </form>
        </OperationPanel>
      )}
    </div>
  );
}
