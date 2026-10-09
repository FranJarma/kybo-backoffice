"use client";
import { LocationSelect } from "@/components/branches/location-select";
import {
  useCallback,
  useEffect,
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
  ShieldAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  baseUnit,
  entryUnits,
  costUnitLabels,
} from "@/modules/catalog/entry-units";
import { decimal } from "@/modules/inventory/decimal";
import { openingQuantity } from "@/modules/inventory/opening-quantity";
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
  item: { id: string; baseUnit: string };
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
      {label}
      {required ? " *" : ""}
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
      ) : !expired && !blocked ? (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-medium text-emerald-700">
          <span className="size-1.5 rounded-full bg-current" />
          Disponible
        </span>
      ) : null}
      {expired && (
        <span className="rounded-lg bg-red-50 px-2.5 py-1.5 text-xs font-medium text-red-600">
          Vencido {quantity(row.expiredQuantity, row.baseUnit)}
        </span>
      )}
      {blocked && (
        <span className="rounded-lg bg-orange-50 px-2.5 py-1.5 text-xs font-medium text-orange-700">
          Bloqueado {quantity(row.blockedQuantity, row.baseUnit)}
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
    [error, setError] = useState(""),
    [detailError, setDetailError] = useState("");
  const [selected, setSelected] = useState<StockRow | null>(null),
    [detail, setDetail] = useState<Detail | null>(null),
    [lotOffset, setLotOffset] = useState(0),
    [movementOffset, setMovementOffset] = useState(0);
  const [action, setAction] = useState<Action | null>(null),
    [lot, setLot] = useState<LotRow | null>(null),
    [itemId, setItemId] = useState(""),
    [locationId, setLocationId] = useState(""),
    [receivedOn, setReceivedOn] = useState(today(timeZone));
  const [expiresOn, setExpiresOn] = useState(""),
    [lotCode, setLotCode] = useState(""),
    [quantityInput, setQuantityInput] = useState(""),
    [unitCost, setUnitCost] = useState(""),
    [reason, setReason] = useState("");
  const [blocked, setBlocked] = useState(false),
    [notice, setNotice] = useState("");
  const stockRequest = useRef(0);
  const [openingOptions, setOpeningOptions] = useState<OpeningOptions | null>(
    null,
  );
  const [entryChoice, setEntryChoice] = useState("");
  const [optionsError, setOptionsError] = useState("");
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
  }, [action, itemId, optionsVersion]);
  const openingReady = openingOptions?.item.id === itemId && !!entryChoice;
  const chosenPack = openingOptions?.presentations.find(
    (p) => `pack:${p.id}` === entryChoice,
  );
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
    }
  }, [search]);
  useEffect(() => {
    const timer = setTimeout(() => void loadStock(), search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [loadStock, search]);
  const loadDetail = useCallback(
    async (id: string, lots = lotOffset, movements = movementOffset) => {
      const sequence = ++detailRequest.current;
      setDetail(null);
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
      }
    },
    [lotOffset, movementOffset],
  );
  useEffect(() => {
    if (!selected) return;
    const timer = setTimeout(() => void loadDetail(selected.itemId), 0);
    return () => clearTimeout(timer);
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
    setUnitCost("");
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
        reason,
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
  const select = (row: StockRow) => {
    detailRequest.current++;
    setSelected(row);
    setLotOffset(0);
    setMovementOffset(0);
    setDetail(null);
    setAction(null);
    setNotice("");
  };
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
          <h1 className="page-title">Inventario y compras</h1>
          <p className="page-description">
            Stock, lotes y movimientos de tus artículos en un solo lugar.
          </p>
        </div>
        <Button
          type="button"
          onClick={() => openAction("opening")}
          disabled={operation.locked}
        >
          <Plus aria-hidden="true" />
          Ingreso manual
        </Button>
      </header>
      {operation.uncertain && (
        <Card className="gap-3 border-amber-200 bg-amber-50 p-5" role="alert">
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
                {operation.error} Reintentá el mismo envío antes de otra
                operación.
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
      <div
        className="grid gap-3 sm:grid-cols-3 sm:gap-4"
        aria-label="Resumen del inventario"
      >
        <Card className="flex-row items-center gap-4 p-5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#eaf4ff] text-blue">
            <Package className="size-6" aria-hidden="true" />
          </span>
          <div>
            <p className="text-3xl leading-tight font-bold tracking-tight text-brand">
              {stock?.total ?? "—"}
            </p>
            <p className="text-sm text-muted">
              {search ? "artículos encontrados" : "artículos en inventario"}
            </p>
          </div>
        </Card>
        <Card className="flex-row items-center gap-4 p-5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="size-6" aria-hidden="true" />
          </span>
          <div>
            <p className="text-3xl leading-tight font-bold tracking-tight text-brand">
              {stock ? usableCount : "—"}
            </p>
            <p className="text-sm text-muted">con stock utilizable</p>
            <p className="mt-1 text-[11px] text-muted">{summaryScope}</p>
          </div>
        </Card>
        <Card className="flex-row items-center gap-4 p-5">
          <span className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-orange-50 text-orange-600">
            <ShieldAlert className="size-6" aria-hidden="true" />
          </span>
          <div>
            <p className="text-3xl leading-tight font-bold tracking-tight text-brand">
              {stock ? restrictedCount : "—"}
            </p>
            <p className="text-sm text-muted">con vencidos o bloqueados</p>
            <p className="mt-1 text-[11px] text-muted">{summaryScope}</p>
          </div>
        </Card>
      </div>
      <section className="space-y-4" aria-label="Stock por artículo">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line">
          <h2 className="inline-flex items-center gap-2 border-b-2 border-[#087cff] px-3 py-3 text-sm font-bold text-blue">
            Artículos
            <span className="rounded-md bg-[#eaf4ff] px-1.5 py-0.5 text-xs">
              {stock?.total ?? "—"}
            </span>
          </h2>
          {stock && (
            <p className="pb-2 text-xs text-muted">
              Corte {date(stock.businessDate)} · Salta
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
              className="h-12 bg-white pl-11"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar artículo…"
            />
          </label>
          <p className="text-xs text-muted">
            Las cantidades se expresan en la unidad base.
          </p>
        </div>
        {error && (
          <p
            role="alert"
            className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm text-red-700"
          >
            {error}
          </p>
        )}
        <Card className="gap-0 overflow-hidden p-0">
          {!stock ? (
            <p role="status" className="p-8 text-center text-sm text-muted">
              Cargando inventario…
            </p>
          ) : stock.rows.length ? (
            <div className="overflow-x-auto">
              <table className="block w-full text-left text-sm md:table">
                <caption className="sr-only">
                  Existencias, costo y estado de cada artículo
                </caption>
                <thead className="hidden bg-[#f9fbfe] text-xs font-medium text-muted md:table-header-group">
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
                <tbody className="block divide-y divide-line md:table-row-group">
                  {stock.rows.map((row) => (
                    <tr
                      key={row.itemId}
                      className={`grid grid-cols-2 items-center gap-x-4 gap-y-4 p-4 transition-colors md:table-row md:p-0 ${selected?.itemId === row.itemId ? "bg-[#f0f7ff]" : "hover:bg-[#fafcff]"}`}
                    >
                      <td className="col-span-2 block min-w-0 md:table-cell md:px-5 md:py-4">
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
                      <td className="block md:table-cell md:px-4 md:py-4">
                        <span className="mb-1 block text-xs text-muted md:hidden">
                          Stock físico
                        </span>
                        <p className="whitespace-nowrap font-medium text-brand">
                          {quantity(row.physicalQuantity, row.baseUnit)}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          Sin fecha:{" "}
                          {quantity(row.undatedQuantity, row.baseUnit)}
                        </p>
                      </td>
                      <td className="block md:table-cell md:px-4 md:py-4">
                        <span className="mb-1 block text-xs text-muted md:hidden">
                          Utilizable
                        </span>
                        <p className="whitespace-nowrap font-semibold text-brand">
                          {quantity(row.usableQuantity, row.baseUnit)}
                        </p>
                      </td>
                      <td className="col-span-2 block md:table-cell md:px-4 md:py-4">
                        <span className="mb-1 block text-xs text-muted md:hidden">
                          Valor y costo
                        </span>
                        <p className="whitespace-nowrap font-medium text-brand">
                          {money(row.stockValue)}
                        </p>
                        <p className="mt-1 text-xs text-muted">
                          Promedio {money(row.averageCost, 6)}/{row.baseUnit}
                        </p>
                      </td>
                      <td className="block md:table-cell md:px-4 md:py-4">
                        <StockStatus row={row} />
                      </td>
                      <td className="block text-right md:table-cell md:px-4 md:py-4">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-blue"
                          onClick={() => select(row)}
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
          ) : (
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
          )}
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
          <Card className="gap-0 overflow-hidden p-0">
            <div className="flex items-start justify-between gap-4 border-b border-line p-5">
              <div>
                <p className="eyebrow">Detalle del artículo</p>
                <h2 className="mt-1 text-xl font-bold text-brand">
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
                onClick={() => {
                  setSelected(null);
                  setDetail(null);
                }}
              >
                <X className="size-5" aria-hidden="true" />
              </Button>
            </div>
            {detailError && (
              <div
                role="alert"
                className="m-5 rounded-lg bg-red-50 p-3 text-sm text-red-700"
              >
                <p>{detailError}</p>
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
                <table className="block w-full text-left text-sm md:table">
                  <caption className="sr-only">
                    Lotes de {selected.name}
                  </caption>
                  <thead className="hidden bg-[#f9fbfe] text-xs text-muted md:table-header-group">
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
                  <tbody className="block divide-y divide-line md:table-row-group">
                    {detail.lots.rows.map((item) => (
                      <tr
                        key={`${item.id}:${item.locationId}`}
                        className="grid grid-cols-2 gap-3 p-5 md:table-row md:p-0"
                      >
                        <td className="block md:table-cell md:px-5 md:py-4">
                          <h4 className="font-semibold text-brand">
                            {item.lotCode || "Sin código"}
                            <span className="block text-xs text-muted">
                              {item.locationName} · reservado:{" "}
                              {quantity(item.reservedQuantity, item.baseUnit)}
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
                        <td className="block md:table-cell md:px-4 md:py-4">
                          <p className="mb-1 text-xs text-muted md:hidden">
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
                        <td className="col-span-2 block md:table-cell md:px-4 md:py-4">
                          <p className="mb-1 text-xs text-muted md:hidden">
                            Cantidad física
                          </p>
                          <p className="whitespace-nowrap font-semibold text-brand">
                            {quantity(item.remainingQuantity, item.baseUnit)}
                          </p>
                          <p className="mt-1 text-xs text-muted">
                            Original{" "}
                            {quantity(item.initialQuantity, item.baseUnit)}
                          </p>
                        </td>
                        <td className="col-span-2 block md:table-cell md:px-5 md:py-4">
                          <div className="flex flex-wrap gap-2 md:justify-end">
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
                              disabled={operation.locked}
                            >
                              Registrar conteo
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => openAction("block", item)}
                              disabled={operation.locked}
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
                  disabled={lotOffset === 0}
                  onClick={() => setLotOffset(Math.max(0, lotOffset - 100))}
                >
                  Lotes anteriores
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    lotOffset + detail.lots.rows.length >= detail.lots.total
                  }
                  onClick={() => setLotOffset(lotOffset + 100)}
                >
                  Más lotes
                </Button>
              </div>
            )}
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
                      <ArrowLeftRight className="size-4" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                        <p className="font-semibold text-brand">
                          {kindLabels[item.kind]}{" "}
                          <span className="ml-1 whitespace-nowrap">
                            {quantity(item.delta, selected.baseUnit)}
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
                  disabled={movementOffset === 0}
                  onClick={() =>
                    setMovementOffset(Math.max(0, movementOffset - 100))
                  }
                >
                  Movimientos anteriores
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  disabled={
                    movementOffset + detail.movements.rows.length >=
                    detail.movements.total
                  }
                  onClick={() => setMovementOffset(movementOffset + 100)}
                >
                  Más movimientos
                </Button>
              </div>
            )}
          </Card>
        </section>
      )}
      {action && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#071b42]/35 p-3 backdrop-blur-[3px]"
          role="presentation"
        >
          <Card
            role="dialog"
            aria-modal="true"
            aria-label={actionLabels[action]}
            className="max-h-[94dvh] w-full max-w-4xl gap-5 overflow-y-auto overscroll-contain rounded-2xl bg-white p-5 shadow-xl sm:p-8"
          >
            <h2 className="text-xl font-bold text-brand">
              {actionLabels[action]}
            </h2>
            <p className="text-sm text-muted">
              {action === "opening"
                ? "El ingreso genera un lote y movimiento con motivo. El costo puede quedar pendiente."
                : `${lot?.itemName} · lote ${lot?.lotCode || "Sin código"} · remanente ${lot ? quantity(lot.remainingQuantity, lot.baseUnit) : ""}`}
            </p>
            <form onSubmit={submit} className="space-y-6">
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
                        setUnitCost("");
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
                        Cargar cantidad en *
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
                          setUnitCost("");
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
                            setUnitCost("");
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
                        set={setUnitCost}
                        disabled={!openingReady}
                      />
                      <p className="mt-2 text-xs text-muted">
                        En pesos. Opcional: dejalo vacío si todavía no lo sabés.
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
                        ? "Cantidad a descartar"
                        : action === "count"
                          ? "Cantidad contada"
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
                    Estado
                    <select
                      className="form-control mt-1"
                      value={blocked ? "1" : "0"}
                      onChange={(event) =>
                        setBlocked(event.target.value === "1")
                      }
                    >
                      <option value="1">Bloqueado</option>
                      <option value="0">Sin bloqueo manual</option>
                    </select>
                  </label>
                )}
                <TextField
                  label="Motivo"
                  value={reason}
                  set={setReason}
                  required
                />
              </fieldset>
              {action === "opening" && optionsError && (
                <div role="alert" className="text-sm text-red-700">
                  {optionsError}
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
              {operation.error && (
                <p
                  role="alert"
                  className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
                >
                  {operation.error}
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={operation.locked}
                  onClick={() => setAction(null)}
                >
                  Cancelar
                </Button>
                {operation.uncertain ? (
                  <Button
                    type="button"
                    disabled={operation.busy}
                    onClick={operation.retry}
                  >
                    Reintentar desde este formulario
                  </Button>
                ) : (
                  <Button
                    type="submit"
                    disabled={
                      operation.locked ||
                      (action === "opening" && !openingReady)
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
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
