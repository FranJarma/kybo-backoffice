"use client";
import {
  ComboConfigurator,
  type ComboSaleConfiguration,
} from "./combo-configurator";

import { paths } from "@/lib/navigation";
import { ProductConfigurator } from "./product-configurator";
import type { PublicConfiguration } from "@/modules/recipes/configuration";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Store,
  Armchair,
  Bike,
  Plus,
  RotateCw,
  ArrowLeft,
  Info,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OperationAlert } from "@/components/ui/operation-alert";
import { ReplenishmentPanel } from "./replenishment-panel";
import { PosRequestCache } from "./request-cache";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { getJson, money, useOperation } from "@/components/inventory/shared";
import { inputDecimal } from "@/components/recipes/shared";
import { decimal, integer } from "@/modules/inventory/decimal";
import type { Actor } from "@/lib/access";
import {
  type SaleChannel,
  type SaleOrigin,
  type SaleDetail,
  type TableView,
  type SaleLookup,
} from "@/modules/sales/types";
import {
  Cart,
  ProductPicker,
  newCartLine,
  cartTotal,
  appendCartLine,
  type CartLine,
} from "./cart";
import {
  Control,
  LookupSelect,
  SalesScope,
  OperationNotice,
  selectClass,
} from "./shared";
import { PaymentDialog, type PaymentDraft } from "./payment-dialog";
import { SaleDetailPanel } from "./sale-detail";
import { SaleHistory } from "./history";

export function SalesManager({
  actorId,
  branchId,
  role,
  initialAccount,
  initialTable,
}: {
  actorId: string;
  branchId: string;
  role: Actor["role"];
  initialAccount?: string;
  initialTable?: string;
}) {
  const [view, setView] = useState<"new" | "history" | "detail" | "append">(
    initialAccount ? "detail" : "new",
  );
  const [origin, setOrigin] = useState<SaleOrigin>(
      initialTable ? "table" : "counter",
    ),
    [channel, setChannel] = useState<SaleChannel>("counter"),
    [fulfillment, setFulfillment] = useState(
      initialTable ? "dine_in" : "takeaway",
    ),
    [tableId, setTableId] = useState(initialTable ?? ""),
    [customerId, setCustomerId] = useState(""),
    [externalId, setExternalId] = useState(""),
    [notes, setNotes] = useState("");
  const [lines, setLines] = useState<CartLine[]>([]),
    [tables, setTables] = useState<TableView[]>([]),
    [detail, setDetail] = useState<SaleDetail | null>(null),
    [loading, setLoading] = useState(!!initialAccount),
    [refresh, setRefresh] = useState(0),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false),
    [cancelOpen, setCancelOpen] = useState(false),
    [cancelReason, setCancelReason] = useState(""),
    [refundConfirmed, setRefundConfirmed] = useState(false);
  const [lastSale, setLastSale] = useState<SaleDetail | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [clearOpen, setClearOpen] = useState(false);
  const [stockHelpOpen, setStockHelpOpen] = useState(false);
  const [orderNoteOpen, setOrderNoteOpen] = useState(false);
  const [orderNoteDraft, setOrderNoteDraft] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<SaleLookup["rows"]>([]);
  const [methodsError, setMethodsError] = useState("");
  const [methodsLoading, setMethodsLoading] = useState(true);
  const [methodsRefresh, setMethodsRefresh] = useState(0);
  const [catalogueRefresh, setCatalogueRefresh] = useState(0);
  const [draftGeneration, setDraftGeneration] = useState(0);
  const cache = useRef(
    new PosRequestCache<PublicConfiguration | ComboSaleConfiguration>(),
  );
  const catalogueRows = useRef(new Map<string, SaleLookup["rows"][number]>());
  const preloads = useRef({ generation: 0 });
  useEffect(() => {
    const state = preloads.current;
    catalogueRows.current.clear();
    state.generation++;
    return () => {
      state.generation++;
    };
  }, [branchId, channel, catalogueRefresh]);
  const configRequest = useRef(false);
  const success = useCallback(
    (result: unknown) => {
      const sale = result as SaleDetail;
      const nextCustomer =
        view === "new" &&
        sale.origin === "counter" &&
        sale.status !== "cancelled";
      window.history.replaceState(
        null,
        "",
        nextCustomer ? "/sales" : `/sales?account=${sale.id}`,
      );
      setDetail(sale);
      setView(nextCustomer ? "new" : "detail");
      if (nextCustomer) {
        setLastSale(sale);
        setNotes("");
        setCustomerId("");
        setCustomerOpen(false);
        setExternalId("");
        setTableId("");
      }
      setLines([]);
      setDraftGeneration((n) => n + 1);
      setPaymentOpen(false);
      setCancelOpen(false);
      setNotice(
        `Venta #${sale.number} guardada.${nextCustomer ? " Lista la caja para el siguiente pedido." : " Los importes quedaron registrados."}`,
      );
      setError("");
      setRefresh((n) => n + 1);
    },
    [view],
  );
  const operation = useOperation<Record<string, unknown>>(
    actorId,
    "sale",
    success,
  );
  const locked = operation.locked || loading;
  useEffect(() => {
    let live = true;
    getJson<SaleLookup>("/api/sales/lookup?kind=payment-methods")
      .then((data) => {
        if (live) {
          setPaymentMethods(data.rows);
          setMethodsError(
            data.total > data.rows.length
              ? "Se muestran los primeros 30 medios de pago."
              : "",
          );
        }
      })
      .catch((e) => {
        if (live) setMethodsError((e as Error).message);
      })
      .finally(() => {
        if (live) setMethodsLoading(false);
      });
    return () => {
      live = false;
    };
  }, [branchId, methodsRefresh]);
  useEffect(() => {
    if (origin !== "table" && fulfillment !== "dine_in") return;
    let live = true;
    getJson<TableView[]>("/api/sales/tables")
      .then((r) => {
        if (live) setTables(r);
      })
      .catch((e) => {
        if (live) setError(e.message);
      });
    return () => {
      live = false;
    };
  }, [origin, fulfillment, refresh]);
  useEffect(() => {
    if (!initialAccount) return;
    let live = true;
    getJson<SaleDetail>(`/api/sales/${initialAccount}`)
      .then((r) => {
        if (live) setDetail(r);
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [initialAccount]);
  const total = cartTotal(lines),
    selectedTable = tables.find((t) => t.id === tableId),
    isAppend = view === "append";
  let valid = !!lines.length && total !== null;
  for (const line of lines) {
    try {
      if (
        decimal(line.price, 2) !== line.expectedPrice &&
        !line.priceReason.trim()
      )
        valid = false;
    } catch {
      valid = false;
    }
  }
  if (
    !isAppend &&
    ((origin === "table" && (!selectedTable || selectedTable.saleId)) ||
      (origin === "delivery" && !externalId.trim()))
  )
    valid = false;
  if (!isAppend && tableId && !selectedTable) valid = false;
  function newSale() {
    setDraftGeneration((n) => n + 1);
    window.history.replaceState(null, "", "/sales");
    setDetail(null);
    setLines([]);
    setNotes("");
    setCustomerId("");
    setExternalId("");
    setTableId("");
    setOrigin("counter");
    setChannel("counter");
    setFulfillment("takeaway");
    setView("new");
    setError("");
    setNotice("");
    operation.clearError();
  }
  function changeOrigin(next: SaleOrigin) {
    setOrigin(next);
    setChannel(next === "delivery" ? "pedidosya" : "counter");
    setFulfillment(
      next === "table"
        ? "dine_in"
        : next === "delivery"
          ? "delivery"
          : "takeaway",
    );
    setTableId("");
    setNotice("");
  }
  const [configuring, setConfiguring] = useState<{
    row: SaleLookup["rows"][number];
    config: PublicConfiguration | ComboSaleConfiguration;
    index?: number;
  } | null>(null);
  const loadConfiguration = useCallback(
    (row: SaleLookup["rows"][number]) => {
      const combo = row.kind === "combo";
      const key = `${branchId}:${channel}:${catalogueRefresh}:${row.id}:${row.pricingRevision ?? ""}:${row.fulfillmentVersionId ?? ""}:${row.price ?? ""}:${combo}`;
      return cache.current.get(key, () =>
        getJson<PublicConfiguration | ComboSaleConfiguration>(
          `/api/sales/products/${row.id}/${combo ? "combo" : "configuration"}?channel=${channel}`,
        ),
      );
    },
    [branchId, channel, catalogueRefresh],
  );
  const warmConfigurations = useCallback(
    (rows: SaleLookup["rows"][number][]) => {
      catalogueRows.current = new Map(rows.map((row) => [row.id, row]));
      const generation = ++preloads.current.generation;
      // Prepare the whole menu with only two requests in flight. A scope change
      // stops the old queue; touching an in-flight product shares its request.
      const queue = rows.filter(
        (row) =>
          !row.temporarilySoldOut &&
          !row.vatPending &&
          row.configured !== false,
      );
      let index = 0;
      const worker = async () => {
        while (
          index < queue.length &&
          generation === preloads.current.generation
        ) {
          const row = queue[index++];
          try {
            await loadConfiguration(row);
          } catch {
            /* A touch retries failed preloads. */
          }
        }
      };
      void worker();
      void worker();
    },
    [loadConfiguration],
  );
  async function configure(row: SaleLookup["rows"][number], index?: number) {
    if (
      locked ||
      configRequest.current ||
      row.temporarilySoldOut ||
      row.vatPending ||
      row.configured === false
    )
      return;
    configRequest.current = true;
    setLoading(true);
    setError("");
    try {
      // Cart edit events carry only id/name. Use the catalogue's base price and
      // fulfillment version so editing shares the same scoped cache as adding.
      const source = catalogueRows.current.get(row.id) ?? {
        ...row,
        kind:
          index !== undefined && lines[index]?.expectedComboVersionId
            ? "combo"
            : row.kind,
      };
      const config = await loadConfiguration(source);
      if ("definition" in config) {
        setConfiguring({ row, config, index });
        return;
      }
      if (config.model === "configurable" && config.groups.length)
        setConfiguring({ row, config, index });
      else if (index === undefined) {
        if (config.basePrice === null)
          throw new Error(
            "Este producto no tiene precio para el canal seleccionado.",
          );
        const item = {
          ...newCartLine({
            ...row,
            price: config.basePrice,
            fulfillmentVersionId: config.fulfillmentVersionId,
            pricingRevision: config.pricingRevision,
          }),
          ...(config.model === "configurable"
            ? {
                expectedRecipeVersionId: config.recipeVersionId ?? undefined,
                modifiers: [],
              }
            : {}),
        };
        setLines((current) => appendCartLine(current, item));
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      configRequest.current = false;
      setLoading(false);
    }
  }
  function submit(payments: PaymentDraft[] = []) {
    if (locked || !valid) return;
    const linePayload = lines.map(
      ({
        productId,
        quantity,
        price,
        expectedPrice,
        priceReason,
        notes,
        expectedRecipeVersionId,
        expectedPricingRevision,
        expectedFulfillmentVersionId,
        modifiers,
        expectedComboVersionId,
        comboChoices,
      }) => ({
        expectedComboVersionId,
        comboChoices,
        expectedRecipeVersionId,
        expectedPricingRevision,
        expectedFulfillmentVersionId,
        modifiers,
        productId,
        quantity,
        price,
        expectedPrice,
        priceReason,
        notes,
      }),
    );
    if (isAppend && detail) {
      operation.submit(`/api/sales/${detail.id}/orders`, {
        requestId: crypto.randomUUID(),
        revision: detail.revision,
        lines: linePayload,
        notes,
      });
      return;
    }
    operation.submit("/api/sales", {
      requestId: crypto.randomUUID(),
      origin,
      channel,
      fulfillment,
      tableId: tableId || undefined,
      customerId: customerId || undefined,
      externalId: origin === "delivery" ? externalId.trim() : undefined,
      notes,
      lines: linePayload,
      payments,
    });
  }
  async function selectSale(id: string) {
    window.history.replaceState(null, "", `/sales?account=${id}`);
    setLoading(true);
    setError("");
    setNotice("");
    setView("detail");
    setDetail(null);
    try {
      setDetail(await getJson<SaleDetail>(`/api/sales/${id}`));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No pudimos abrir la cuenta.");
    } finally {
      setLoading(false);
    }
  }
  async function refreshPrices() {
    cache.current.clear();
    setCatalogueRefresh((n) => n + 1);
    setMethodsRefresh((n) => n + 1);
    setLoading(true);
    setError("");
    try {
      const updated = await Promise.all(
        lines.map(async (line) => {
          if (line.expectedComboVersionId)
            throw new Error(
              `Revisá las opciones de ${line.name} con Editar opciones.`,
            );
          const config = await getJson<PublicConfiguration>(
            `/api/sales/products/${line.productId}/configuration?channel=${channel}`,
          );
          if (config.groups.length)
            throw new Error(
              `Revisá las opciones de ${line.name} con Editar opciones.`,
            );
          const result = await getJson<SaleLookup>(
              `/api/sales/lookup?kind=products&channel=${channel}&q=${line.productId}`,
            ),
            row = result.rows.find((r) => r.id === line.productId);
          if (!row)
            throw new Error(
              `El producto ${line.name} ya no está disponible. Quitalo del pedido.`,
            );
          let defaultPrice = false;
          try {
            defaultPrice = decimal(line.price, 2) === line.expectedPrice;
          } catch {}
          return {
            ...line,
            expectedFulfillmentVersionId:
              config.fulfillmentVersionId ?? undefined,
            expectedRecipeVersionId:
              config.model === "configurable"
                ? config.recipeVersionId
                : undefined,
            modifiers: config.model === "configurable" ? [] : undefined,
            configurable: false,
            name: row.name,
            expectedPrice: row.price ?? null,
            price: defaultPrice
              ? row.price === null || row.price === undefined
                ? ""
                : inputDecimal(row.price)
              : line.price,
          };
        }),
      );
      setLines(updated);
      setRefresh((n) => n + 1);
      operation.clearError();
      setNotice("Precios actualizados. Revisá el total antes de confirmar.");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "No pudimos actualizar los precios.",
      );
    } finally {
      setLoading(false);
    }
  }
  const showCart = view === "new" || view === "append";
  return (
    <div
      data-pos
      className="space-y-3 md:flex md:h-full md:min-h-0 md:flex-col [&>div:not([data-pos-workspace])]:shrink-0"
    >
      <Dialog
        open={!!configuring}
        onOpenChange={(open) => {
          if (!open) setConfiguring(null);
        }}
      >
        <DialogContent className="max-h-[94dvh] overflow-y-auto sm:max-w-4xl [&_[data-slot=dialog-close]]:flex [&_[data-slot=dialog-close]]:min-h-12 [&_[data-slot=dialog-close]]:min-w-12 [&_[data-slot=dialog-close]]:items-center [&_[data-slot=dialog-close]]:justify-center">
          <DialogHeader>
            <DialogTitle>{configuring?.row.name}</DialogTitle>
            <DialogDescription>
              Elegí las opciones de este producto.
            </DialogDescription>
          </DialogHeader>
          {configuring &&
            ("definition" in configuring.config ? (
              <ComboConfigurator
                config={configuring.config}
                initialChoices={
                  configuring.index === undefined
                    ? undefined
                    : lines[configuring.index]?.comboChoices
                }
                channel={channel}
                onCancel={() => setConfiguring(null)}
                onConfirm={(data) => {
                  setLines((current) => {
                    const index = configuring.index;
                    const item = {
                      ...(index === undefined
                        ? newCartLine(configuring.row)
                        : current[index]),
                      ...data,
                      expectedPricingRevision:
                        configuring.config.pricingRevision,
                      configurable: true,
                      expectedFulfillmentVersionId: undefined,
                      expectedRecipeVersionId: undefined,
                      modifiers: [],
                      price: inputDecimal(data.expectedPrice),
                      priceReason: "",
                    };
                    return index === undefined
                      ? appendCartLine(current, item)
                      : current.map((l, i) => (i === index ? item : l));
                  });
                  setConfiguring(null);
                }}
              />
            ) : (
              <ProductConfigurator
                key={configuring.config.recipeVersionId}
                config={configuring.config}
                initialSelection={
                  configuring.index === undefined
                    ? undefined
                    : lines[configuring.index]?.modifiers
                }
                onCancel={() => setConfiguring(null)}
                onConfirm={(data) => {
                  setLines((current) => {
                    const index = configuring.index;
                    const item = {
                      ...(index === undefined
                        ? newCartLine(configuring.row)
                        : current[index]),
                      ...data,
                      expectedPricingRevision:
                        configuring.config.pricingRevision,
                      expectedFulfillmentVersionId:
                        "fulfillmentVersionId" in configuring.config
                          ? (configuring.config.fulfillmentVersionId ??
                            undefined)
                          : undefined,
                      configurable:
                        "groups" in configuring.config &&
                        configuring.config.groups.length > 0,
                      price: inputDecimal(data.expectedPrice),
                      priceReason: "",
                    };
                    return index === undefined
                      ? appendCartLine(current, item)
                      : current.map((l, i) => (i === index ? item : l));
                  });
                  setConfiguring(null);
                }}
              />
            ))}
        </DialogContent>
      </Dialog>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-extrabold tracking-tight text-brand">
            Punto de venta
          </h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <ReplenishmentPanel actorId={actorId} role={role} refresh={refresh} />
          <Button
            variant="ghost"
            className="min-h-12"
            disabled={locked}
            onClick={refreshPrices}
          >
            <RotateCw size={17} />
            Actualizar carta
          </Button>
          <Button asChild variant="outline" className="min-h-12">
            <Link href={paths["tables"]}>
              <Armchair size={17} />
              Mesas
            </Link>
          </Button>
          {!showCart && (
            <Button onClick={newSale} disabled={locked}>
              <Plus size={17} />
              Nueva venta
            </Button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-b border-line">
        <button
          disabled={locked}
          onClick={() => {
            if (view !== "new") newSale();
          }}
          className={`min-h-12 border-b-2 px-3 text-sm font-bold ${showCart ? "border-orange-500 text-brand" : "border-transparent text-muted"}`}
        >
          Nueva venta
        </button>
        <button
          disabled={locked || lines.length > 0}
          onClick={() => {
            setView("history");
            setNotice("");
          }}
          className={`min-h-12 border-b-2 px-3 text-sm font-bold ${view === "history" ? "border-orange-500 text-brand" : "border-transparent text-muted"}`}
        >
          Historial
        </button>
        {lastSale && (
          <Button
            className="min-h-12"
            variant="ghost"
            disabled={locked || lines.length > 0}
            onClick={() => void selectSale(lastSale.id)}
          >
            Última venta #{lastSale.number}
          </Button>
        )}
        <Button
          type="button"
          variant="ghost"
          className="ml-auto min-h-12 text-muted"
          onClick={() => setStockHelpOpen(true)}
        >
          <Info size={16} />
          Ayuda de stock
        </Button>
      </div>
      {!paymentOpen && !cancelOpen && (
        <OperationNotice
          error={operation.error}
          uncertain={operation.uncertain}
          busy={operation.busy}
          retry={operation.retry}
        />
      )}
      {error && (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
        >
          {error}
        </p>
      )}
      <OperationAlert
        title="Punto de venta"
        message={notice}
        viewportClassName="bottom-[200px] sm:bottom-[200px]"
      />
      {loading && showCart && (
        <p role="status" className="text-sm text-muted">
          Preparando selección…
        </p>
      )}
      {showCart && (
        <>
          <div
            data-pos-workspace
            className="grid min-h-0 gap-3 md:flex-1 md:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_440px] 2xl:grid-cols-[minmax(0,1fr)_480px]"
          >
            <div className="flex min-h-0 min-w-0 flex-col gap-3">
              <div className="shrink-0">
                {isAppend && detail ? (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
                    <div>
                      <p className="text-sm font-bold text-brand">
                        Nuevo pedido · {detail.tableName}
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        Venta #{detail.number} · saldo actual{" "}
                        {money(detail.balanceDue)}
                      </p>
                    </div>
                    <Button
                      disabled={locked}
                      variant="ghost"
                      onClick={() => {
                        setView("detail");
                        setLines([]);
                        setNotes("");
                      }}
                    >
                      <ArrowLeft size={15} />
                      Volver a la cuenta
                    </Button>
                  </div>
                ) : (
                  <div className="flex flex-wrap items-center gap-2">
                    {(
                      [
                        {
                          value: "counter",
                          label: "Mostrador",
                          hint: "Cobrar antes de preparar",
                          icon: Store,
                        },
                        {
                          value: "table",
                          label: "Mesa",
                          hint: "Cuenta abierta, cobro al final",
                          icon: Armchair,
                        },
                        {
                          value: "delivery",
                          label: "Delivery",
                          hint: "PedidosYa y Uber Eats",
                          icon: Bike,
                        },
                      ] as const
                    ).map(({ value, label, icon: Icon }) => (
                      <button
                        key={value}
                        disabled={locked || lines.length > 0}
                        onClick={() => changeOrigin(value)}
                        aria-label={label}
                        aria-pressed={origin === value}
                        className={`flex min-h-12 items-center justify-center gap-2 rounded-xl border px-4 py-2 text-center ${origin === value ? "border-orange-300 bg-orange-50/70" : "border-line bg-white hover:border-slate-300"} disabled:cursor-default`}
                      >
                        <span
                          className={
                            origin === value ? "text-orange-700" : "text-muted"
                          }
                        >
                          <Icon size={21} />
                        </span>
                        <span>
                          <span className="block text-xs font-extrabold text-brand sm:text-sm">
                            {label}
                          </span>
                        </span>
                      </button>
                    ))}
                    {origin === "counter" && (
                      <div className="flex gap-1 rounded-xl bg-white p-1">
                        {[
                          { id: "takeaway", label: "Para llevar" },
                          { id: "dine_in", label: "En el local" },
                        ].map((option) => (
                          <Button
                            key={option.id}
                            variant={
                              fulfillment === option.id ? "secondary" : "ghost"
                            }
                            className="min-h-12"
                            aria-pressed={fulfillment === option.id}
                            disabled={locked}
                            onClick={() => {
                              setFulfillment(option.id);
                              setTableId("");
                            }}
                          >
                            {option.label}
                          </Button>
                        ))}
                      </div>
                    )}
                    <Button
                      variant="ghost"
                      className="min-h-12"
                      disabled={locked}
                      aria-expanded={customerOpen}
                      onClick={() => setCustomerOpen((v) => !v)}
                    >
                      {customerId ? "Cambiar cliente" : "Cliente ocasional"}
                    </Button>
                  </div>
                )}
              </div>
              {!isAppend &&
                (customerOpen ||
                  origin !== "counter" ||
                  fulfillment === "dine_in") && (
                  <section className="surface-panel grid shrink-0 gap-3 p-3 sm:grid-cols-2">
                    {customerOpen && (
                      <LookupSelect
                        kind="customers"
                        label="Cliente"
                        value={customerId}
                        disabled={locked}
                        onChange={setCustomerId}
                        empty="Consumidor ocasional"
                      />
                    )}
                    {origin === "delivery" ? (
                      <>
                        <Control label="Plataforma">
                          <select
                            value={channel}
                            disabled={locked || lines.length > 0}
                            className={selectClass}
                            onChange={(e) =>
                              setChannel(e.target.value as SaleChannel)
                            }
                          >
                            <option value="pedidosya">PedidosYa</option>
                            <option value="ubereats">Uber Eats</option>
                          </select>
                        </Control>
                        <Control label="Número del pedido externo">
                          <Input
                            value={externalId}
                            disabled={locked}
                            maxLength={80}
                            placeholder="Ej. 2280061098"
                            onChange={(e) => setExternalId(e.target.value)}
                          />
                        </Control>
                        <Control label="Entrega">
                          <select
                            value={fulfillment}
                            disabled={locked}
                            className={selectClass}
                            onChange={(e) => setFulfillment(e.target.value)}
                          >
                            <option value="delivery">
                              Envío de la plataforma
                            </option>
                            <option value="pickup">Retiro en el local</option>
                          </select>
                        </Control>
                      </>
                    ) : origin === "table" ? (
                      <Control label="Mesa">
                        <select
                          className={selectClass}
                          disabled={locked || lines.length > 0}
                          value={tableId}
                          onChange={(e) => setTableId(e.target.value)}
                        >
                          <option value="">Seleccionar mesa</option>
                          {tables.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.name}
                              {t.saleId ? " · Cuenta abierta" : ""}
                            </option>
                          ))}
                        </select>
                      </Control>
                    ) : (
                      <>
                        {fulfillment === "dine_in" && (
                          <Control label="Mesa de consumo (opcional)">
                            <select
                              className={selectClass}
                              value={tableId}
                              disabled={locked}
                              onChange={(e) => setTableId(e.target.value)}
                            >
                              <option value="">Sin mesa asociada</option>
                              {tables.map((t) => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          </Control>
                        )}
                      </>
                    )}
                    {origin === "table" && selectedTable?.saleId && (
                      <p className="text-sm text-amber-800 sm:col-span-2">
                        Esta mesa ya tiene una cuenta.{" "}
                        <Link
                          className="font-bold underline"
                          href={`/sales?account=${selectedTable.saleId}`}
                        >
                          Abrir venta #{selectedTable.saleNumber}
                        </Link>
                      </p>
                    )}
                  </section>
                )}
              <ProductPicker
                key={channel}
                channel={channel}
                locked={locked || lines.length >= 50}
                onAdd={configure}
                refresh={catalogueRefresh}
                onCatalogueLoaded={warmConfigurations}
              />
            </div>
            <div className="flex min-h-0 min-w-0 flex-col gap-2">
              <Cart
                key={`${branchId}:${channel}:${draftGeneration}`}
                onEdit={(index) =>
                  configure(
                    { id: lines[index].productId, name: lines[index].name },
                    index,
                  )
                }
                lines={lines}
                onChange={setLines}
                locked={locked}
                allowPrice={role !== "staff" || channel !== "counter"}
                total={total}
              >
                <Button
                  type="button"
                  variant="ghost"
                  className="mb-1 min-h-12 w-full justify-start px-0 text-xs text-muted"
                  disabled={locked}
                  onClick={() => {
                    setOrderNoteDraft(notes);
                    setOrderNoteOpen(true);
                  }}
                >
                  <MessageSquare size={16} />
                  <span className="truncate">
                    {notes ? `Nota: ${notes}` : "Agregar nota al pedido"}
                  </span>
                </Button>
                {isAppend ? (
                  <Button
                    className="min-h-14 w-full text-base"
                    disabled={locked || !valid}
                    onClick={() => submit()}
                  >
                    Guardar pedido
                  </Button>
                ) : origin === "table" ? (
                  <Button
                    className="min-h-14 w-full text-base"
                    disabled={locked || !valid}
                    onClick={() => submit()}
                  >
                    Abrir cuenta
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Button
                      className="min-h-14 w-full text-base"
                      disabled={locked || !valid}
                      onClick={() => {
                        if (total && integer(total) === 0n) submit();
                        else {
                          operation.clearError();
                          setPaymentOpen(true);
                        }
                      }}
                    >
                      {lines.length > 0 && total === "0.00"
                        ? "Registrar sin cargo"
                        : origin === "delivery"
                          ? "Registrar con cobro"
                          : "Cobrar"}
                    </Button>
                    {origin === "delivery" && (
                      <Button
                        className="w-full"
                        variant="outline"
                        disabled={locked || !valid}
                        onClick={() => submit()}
                      >
                        Registrar pendiente de cobro
                      </Button>
                    )}
                  </div>
                )}
              </Cart>
              {lines.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={locked}
                    onClick={refreshPrices}
                  >
                    <RotateCw size={14} />
                    Actualizar precios
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={locked}
                    onClick={() => setClearOpen(true)}
                  >
                    Vaciar pedido
                  </Button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
      <Dialog open={stockHelpOpen} onOpenChange={setStockHelpOpen}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Stock y preparación</DialogTitle>
            <DialogDescription>
              Cómo se reserva y descuenta el stock de los pedidos.
            </DialogDescription>
          </DialogHeader>
          <SalesScope />
          <Button
            type="button"
            className="min-h-12"
            onClick={() => setStockHelpOpen(false)}
          >
            Entendido
          </Button>
        </DialogContent>
      </Dialog>
      <Dialog
        open={orderNoteOpen}
        onOpenChange={(open) => {
          if (!locked) setOrderNoteOpen(open);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>Observaciones del pedido</DialogTitle>
            <DialogDescription>
              Agregá indicaciones para todo el pedido.
            </DialogDescription>
          </DialogHeader>
          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (!locked) {
                setNotes(orderNoteDraft);
                setOrderNoteOpen(false);
              }
            }}
          >
            <Control label="Observaciones del pedido">
              <Input
                autoFocus
                className="min-h-12"
                value={orderNoteDraft}
                disabled={locked}
                maxLength={500}
                placeholder="Aclaraciones para el pedido"
                onChange={(event) => setOrderNoteDraft(event.target.value)}
              />
            </Control>
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                className="min-h-12"
                disabled={locked}
                onClick={() => setOrderNoteOpen(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" className="min-h-12" disabled={locked}>
                Guardar nota
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>¿Vaciar el pedido?</DialogTitle>
            <DialogDescription>
              Se quitarán los productos del pedido actual.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3">
            <Button
              className="min-h-12"
              variant="outline"
              onClick={() => setClearOpen(false)}
            >
              Conservar pedido
            </Button>
            <Button
              className="min-h-12"
              disabled={locked}
              onClick={() => {
                setLines([]);
                setDraftGeneration((n) => n + 1);
                setNotes("");
                operation.clearError();
                setClearOpen(false);
              }}
            >
              Vaciar pedido
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      {view === "history" && (
        <SaleHistory
          locked={locked}
          onSelect={(sale) => void selectSale(sale.id)}
        />
      )}
      {view === "detail" &&
        (loading ? (
          <p role="status" className="py-16 text-center text-sm text-muted">
            Cargando cuenta…
          </p>
        ) : detail ? (
          <SaleDetailPanel
            actorId={actorId}
            sale={detail}
            canCancel={role !== "staff"}
            locked={locked}
            onPay={() => {
              operation.clearError();
              setPaymentOpen(true);
            }}
            onAdd={() => {
              setView("append");
              setChannel("counter");
              setLines([]);
              setDraftGeneration((n) => n + 1);
              setNotes("");
              setNotice("");
            }}
            onCancel={() => {
              operation.clearError();
              setCancelReason("");
              setRefundConfirmed(false);
              setCancelOpen(true);
            }}
            onBack={() => {
              setView("history");
              setNotice("");
            }}
          />
        ) : (
          <Button
            disabled={locked}
            variant="outline"
            onClick={() => {
              if (initialAccount) void selectSale(initialAccount);
              else setView("history");
            }}
          >
            Volver a consultar
          </Button>
        ))}
      {paymentOpen && (
        <PaymentDialog
          methods={paymentMethods}
          methodsError={methodsError}
          methodsLoading={methodsLoading}
          canManageMethods={role !== "staff"}
          onRefreshMethods={() => {
            setMethodsLoading(true);
            setMethodsError("");
            setMethodsRefresh((n) => n + 1);
          }}
          amount={view === "detail" ? detail!.balanceDue : total!}
          delivery={
            view === "detail"
              ? detail!.origin === "delivery"
              : origin === "delivery"
          }
          exact={view !== "detail" && origin === "counter"}
          locked={operation.locked}
          busy={operation.busy}
          error={operation.error}
          uncertain={operation.uncertain}
          onRetry={operation.retry}
          onClose={() => setPaymentOpen(false)}
          onConfirm={(payments) => {
            if (view === "detail" && detail)
              operation.submit(`/api/sales/${detail.id}/payments`, {
                requestId: crypto.randomUUID(),
                revision: detail.revision,
                payments,
              });
            else submit(payments);
          }}
        />
      )}
      {cancelOpen && detail && (
        <Dialog
          open
          onOpenChange={(v) => {
            if (!v && !operation.locked) setCancelOpen(false);
          }}
        >
          <DialogContent showCloseButton={!operation.locked}>
            <DialogHeader>
              <DialogTitle>Anular venta #{detail.number}</DialogTitle>
              <DialogDescription>
                Se conserva la venta y su historial. Esta acción no envía
                devoluciones a un banco ni a una plataforma.
              </DialogDescription>
            </DialogHeader>
            <OperationNotice
              error={operation.error}
              uncertain={operation.uncertain}
              busy={operation.busy}
              retry={operation.retry}
            />
            <Control label="Motivo de anulación">
              <Input
                value={cancelReason}
                disabled={operation.locked}
                maxLength={500}
                onChange={(e) => setCancelReason(e.target.value)}
              />
            </Control>
            {integer(detail.paidAmount) > 0n && (
              <label className="flex items-start gap-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-950">
                <input
                  className="mt-1 size-4"
                  type="checkbox"
                  disabled={operation.locked}
                  checked={refundConfirmed}
                  onChange={(e) => setRefundConfirmed(e.target.checked)}
                />
                <span>
                  Confirmo que ya se devolvieron {money(detail.paidAmount)} por
                  los medios originales o que la plataforma confirmó su
                  devolución.
                </span>
              </label>
            )}
            <Button
              disabled={
                operation.locked ||
                !cancelReason.trim() ||
                (integer(detail.paidAmount) > 0n && !refundConfirmed)
              }
              onClick={() =>
                operation.submit(`/api/sales/${detail.id}/cancel`, {
                  requestId: crypto.randomUUID(),
                  revision: detail.revision,
                  reason: cancelReason,
                  refundConfirmed,
                })
              }
            >
              Confirmar anulación
            </Button>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
