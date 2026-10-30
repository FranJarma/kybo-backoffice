"use client";
import { useErrorFeedback } from "@/components/ui/use-error-feedback";
import { CashStatusGate } from "@/components/cash/status-gate";
import {
  ComboConfigurator,
  type ComboSaleConfiguration,
} from "./combo-configurator";

import { CustomerPicker } from "./customer-picker";
import { OrderControls } from "./order-controls";
import { ProductConfigurator } from "./product-configurator";
import type { PublicConfiguration } from "@/modules/recipes/configuration";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Plus,
  RotateCw,
  ArrowLeft,
  Info,
  MessageSquare,
  SlidersHorizontal,
  ShoppingBag,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OperationAlert } from "@/components/ui/operation-alert";
import { FieldCaption } from "@/components/ui/field-caption";
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
import { Control, SalesScope, OperationNotice, selectClass } from "./shared";
import { PaymentDialog, type PaymentDraft } from "./payment-dialog";
import { SaleDetailDialog } from "./sale-detail-dialog";
import { SaleHistory } from "./history";
import { LocatorPicker } from "@/components/pickup/locator-picker";
import { useLocators } from "@/components/pickup/use-locators";
import {
  locatorSelection,
  nextAvailableLocator,
} from "@/modules/pickup/selection";
import { PickupActions } from "@/components/pickup/locator-manager";
import { WorkplaceActions } from "@/components/workplace/actions";
import { WorkplaceSummary } from "@/components/workplace/summary";
import { QrCode } from "lucide-react";

type WorkspaceView = "new" | "history" | "append";
type DraftSnapshot = {
  lines: CartLine[];
  origin: SaleOrigin;
  channel: SaleChannel;
  fulfillment: string;
  tableId: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  externalId: string;
  notes: string;
  locatorNumber: number | null;
  locatorMode: "automatic" | "manual";
  tabletPanel: "products" | "order";
};

export function SalesManager({
  actorId,
  branchId,
  role,
  accountKind = "personal",
  initialAccount,
  initialTable,
}: {
  actorId: string;
  branchId: string;
  role: Actor["role"];
  accountKind?: Actor["accountKind"];
  initialAccount?: string;
  initialTable?: string;
}) {
  const [tabletPanel, setTabletPanel] = useState<"products" | "order">(
    "products",
  );
  const [toolsOpen, setToolsOpen] = useState(false);
  const [view, setView] = useState<"new" | "history" | "detail" | "append">(
    initialAccount ? "detail" : "new",
  );
  const [returnView, setReturnView] = useState<WorkspaceView>("new");
  const [seenAccount, setSeenAccount] = useState(initialAccount);
  const workspaceView = view === "detail" ? returnView : view;
  const [appendSale, setAppendSale] = useState<SaleDetail | null>(null);
  const savedDraft = useRef<{
    view: WorkspaceView;
    draft: DraftSnapshot;
  } | null>(null);
  const [historyOpened, setHistoryOpened] = useState(false);
  const detailRequest = useRef({ revision: 0 });
  const activeDetailId = useRef(initialAccount ?? "");
  const modalOpener = useRef<HTMLElement | null>(null);
  const [detailLoading, setDetailLoading] = useState(!!initialAccount);
  const [detailError, setDetailError] = useState("");
  const [fulfillmentBusy, setFulfillmentBusy] = useState(false);
  const [origin, setOrigin] = useState<SaleOrigin>(
      initialTable ? "table" : "counter",
    ),
    [channel, setChannel] = useState<SaleChannel>("counter"),
    [fulfillment, setFulfillment] = useState(
      initialTable ? "dine_in" : "takeaway",
    ),
    [tableId, setTableId] = useState(initialTable ?? ""),
    [customerId, setCustomerId] = useState(""),
    [customerName, setCustomerName] = useState(""),
    [customerEmail, setCustomerEmail] = useState(""),
    [externalId, setExternalId] = useState(""),
    [notes, setNotes] = useState("");
  const [lines, setLines] = useState<CartLine[]>([]),
    [tables, setTables] = useState<TableView[]>([]),
    [detail, setDetail] = useState<SaleDetail | null>(null),
    [loading, setLoading] = useState(false),
    [refresh, setRefresh] = useState(0),
    [error, setError, errorAttempt] = useErrorFeedback(),
    [notice, setNotice] = useState("");
  const [paymentOpen, setPaymentOpen] = useState(false),
    [cancelOpen, setCancelOpen] = useState(false),
    [cancelReason, setCancelReason] = useState(""),
    [refundConfirmed, setRefundConfirmed] = useState(false);
  const [lastSale, setLastSale] = useState<SaleDetail | null>(null);
  const [locatorNumber, setLocatorNumber] = useState<number | null>(null);
  const [locatorMode, setLocatorMode] = useState<"automatic" | "manual">(
    "automatic",
  );
  const { fleet: locatorFleet, error: locatorError } = useLocators(refresh);
  const displayedLocator =
    locatorMode === "automatic"
      ? nextAvailableLocator(locatorFleet)
      : locatorNumber;
  const locatorState = locatorSelection(locatorFleet, locatorNumber);
  const locatorIssue =
    locatorMode === "automatic"
      ? ""
      : locatorError ||
        (!locatorFleet
          ? "Consultando la disponibilidad de localizadores…"
          : !locatorState.valid
            ? locatorNumber === null
              ? "Elegí un localizador para continuar."
              : `El localizador ${locatorNumber} ya está ocupado o no está disponible. Elegí otro.`
            : "");
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
  const restoreDraft = useCallback((draft: DraftSnapshot) => {
    setLines(draft.lines);
    setOrigin(draft.origin);
    setChannel(draft.channel);
    setFulfillment(draft.fulfillment);
    setTableId(draft.tableId);
    setCustomerId(draft.customerId);
    setCustomerName(draft.customerName);
    setCustomerEmail(draft.customerEmail);
    setExternalId(draft.externalId);
    setNotes(draft.notes);
    setLocatorNumber(draft.locatorNumber);
    setLocatorMode(draft.locatorMode);
    setTabletPanel(draft.tabletPanel);
    setDraftGeneration((n) => n + 1);
  }, []);
  const loadSaleDetail = useCallback(async (id: string) => {
    const request = ++detailRequest.current.revision;
    activeDetailId.current = id;
    try {
      const sale = await getJson<SaleDetail>(`/api/sales/${id}`);
      if (detailRequest.current.revision === request) setDetail(sale);
    } catch (error) {
      if (detailRequest.current.revision === request)
        setDetailError(
          error instanceof Error
            ? error.message
            : "No pudimos consultar la venta.",
        );
    } finally {
      if (detailRequest.current.revision === request) setDetailLoading(false);
    }
  }, []);
  const success = useCallback(
    (result: unknown) => {
      const sale = result as SaleDetail;
      if (view === "detail" && activeDetailId.current !== sale.id) {
        setRefresh((n) => n + 1);
        setNotice(`Venta #${sale.number} actualizada.`);
        return;
      }
      if (view === "detail" || view === "append") {
        if (
          view === "append" ||
          (appendSale?.id === sale.id && sale.status === "cancelled")
        ) {
          if (savedDraft.current) {
            restoreDraft(savedDraft.current.draft);
            setReturnView(savedDraft.current.view);
            savedDraft.current = null;
          }
          setAppendSale(null);
        }
        ++detailRequest.current.revision;
        activeDetailId.current = sale.id;
        setDetail(sale);
        setDetailLoading(false);
        setDetailError("");
        setView("detail");
        setLastSale((previous) => (previous?.id === sale.id ? sale : previous));
        setPaymentOpen(false);
        setCancelOpen(false);
        setError("");
        setNotice(`Venta #${sale.number} actualizada.`);
        setRefresh((n) => n + 1);
        const url = new URL(window.location.href);
        url.searchParams.set("account", sale.id);
        window.history.replaceState(null, "", url);
        return;
      }
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
      activeDetailId.current = sale.id;
      setReturnView("new");
      setView(nextCustomer ? "new" : "detail");
      if (nextCustomer) {
        setLastSale(sale);
        setNotes("");
        setCustomerId("");
        setCustomerName("");
        setCustomerEmail("");
        setTabletPanel("products");
        setExternalId("");
        setTableId("");
      }
      setLines([]);
      setNotes("");
      setCustomerId("");
      setCustomerName("");
      setCustomerEmail("");
      setExternalId("");
      setTableId("");
      setOrigin("counter");
      setChannel("counter");
      setFulfillment("takeaway");
      setLocatorNumber(null);
      setLocatorMode("automatic");
      setDraftGeneration((n) => n + 1);
      setPaymentOpen(false);
      setCancelOpen(false);
      setNotice(
        `Venta #${sale.number} guardada.${sale.orders.at(-1)?.locatorNumber != null ? ` Localizador ${sale.orders.at(-1)!.locatorNumber}.` : ""}${nextCustomer ? " Lista la caja para el siguiente pedido." : " Los importes quedaron registrados."}`,
      );
      setError("");
      setRefresh((n) => n + 1);
    },
    [view, appendSale, restoreDraft, setError],
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
  }, [origin, fulfillment, refresh, setError]);
  useEffect(() => {
    if (!initialAccount) {
      activeDetailId.current = "";
      return;
    }
    let live = true;
    const requests = detailRequest.current;
    void Promise.resolve().then(() => {
      if (live) return loadSaleDetail(initialAccount);
    });
    return () => {
      live = false;
      ++requests.revision;
    };
  }, [initialAccount, loadSaleDetail]);
  // A new server navigation can change account without remounting the register.
  // Reset only the queried detail before rendering, preserving the live workspace.
  if (seenAccount !== initialAccount) {
    setSeenAccount(initialAccount);
    setDetail(null);
    setDetailLoading(!!initialAccount);
    setDetailError("");
    setPaymentOpen(false);
    setCancelOpen(false);
    if (initialAccount) {
      if (view !== "detail") setReturnView(view);
      setView("detail");
    } else if (view === "detail") setView(returnView);
  }
  const total = cartTotal(lines),
    selectedTable = tables.find((t) => t.id === tableId),
    isAppend = workspaceView === "append";
  const customerIssue =
    !isAppend &&
    !customerId &&
    customerName.trim() &&
    customerEmail.trim() &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail.trim())
      ? "Revisá el email del cliente o dejalo vacío."
      : "";
  let valid =
    !!lines.length && total !== null && !locatorIssue && !customerIssue;
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
    window.history.replaceState(null, "", "/sales");
    setView("new");
    setReturnView("new");
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
    if (isAppend && appendSale) {
      operation.submit(`/api/sales/${appendSale.id}/orders`, {
        requestId: crypto.randomUUID(),
        revision: appendSale.revision,
        lines: linePayload,
        notes,
        locatorMode,
        locatorNumber: locatorMode === "manual" ? locatorNumber : undefined,
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
      newCustomer:
        !customerId && customerName.trim()
          ? {
              name: customerName.trim(),
              email: customerEmail.trim() || undefined,
            }
          : undefined,
      externalId: origin === "delivery" ? externalId.trim() : undefined,
      notes,
      lines: linePayload,
      payments,
      locatorMode,
      locatorNumber: locatorMode === "manual" ? locatorNumber : undefined,
    });
  }
  async function selectSale(id: string) {
    if (operation.locked || fulfillmentBusy) return;
    if (view !== "detail") {
      setReturnView(view);
      modalOpener.current =
        document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("account", id);
    window.history.replaceState(null, "", url);
    setError("");
    setNotice("");
    setView("detail");
    setDetail(null);
    setDetailLoading(true);
    setDetailError("");
    await loadSaleDetail(id);
  }
  function closeSaleDetail() {
    if (operation.locked || fulfillmentBusy) return;
    ++detailRequest.current.revision;
    activeDetailId.current = "";
    setDetailLoading(false);
    setDetailError("");
    setDetail(null);
    setView(returnView);
    const url = new URL(window.location.href);
    url.searchParams.delete("account");
    window.history.replaceState(null, "", url);
  }
  async function refreshLocatorDetail() {
    setRefresh((n) => n + 1);
    if (view === "detail" && activeDetailId.current) {
      setDetailError("");
      await loadSaleDetail(activeDetailId.current);
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
  const showCart = workspaceView === "new" || workspaceView === "append";
  const orderActions = (
    <>
      {!isAppend && (
        <CustomerPicker
          key={draftGeneration}
          id={customerId}
          name={customerName}
          email={customerEmail}
          issue={customerIssue}
          disabled={locked}
          onChange={(id, name, email) => {
            setCustomerId(id);
            setCustomerName(name);
            setCustomerEmail(email);
          }}
        />
      )}
      <LocatorPicker
        value={displayedLocator}
        automatic={locatorMode === "automatic"}
        onAutomatic={() => setLocatorMode("automatic")}
        onChange={(number) => {
          setLocatorNumber(number);
          setLocatorMode(number === null ? "automatic" : "manual");
        }}
        disabled={locked}
        fleet={locatorFleet}
        issue={locatorIssue}
      />
    </>
  );
  return (
    <div
      data-pos
      className="flex h-full min-h-0 flex-col gap-3 [&>div:not([data-pos-workspace])]:shrink-0"
    >
      <CashStatusGate key={branchId} branchId={branchId} />
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
          <h1
            data-pos-title
            tabIndex={-1}
            className="text-xl font-extrabold tracking-tight text-brand"
          >
            Punto de venta
          </h1>
        </div>
        <Button
          variant="outline"
          className="min-h-12 xl:hidden"
          aria-expanded={toolsOpen}
          aria-controls="pos-tools"
          onClick={() => setToolsOpen((open) => !open)}
        >
          <SlidersHorizontal size={18} />
          Herramientas
        </Button>
        <div
          id="pos-tools"
          className={`${toolsOpen ? "flex" : "hidden"} w-full flex-wrap gap-2 rounded-xl border border-line bg-white p-3 xl:flex xl:w-auto xl:border-0 xl:bg-transparent xl:p-0`}
        >
          <PickupActions
            key={branchId}
            actorId={actorId}
            onChanged={() => void refreshLocatorDetail()}
            onOpenSale={(id) => void selectSale(id)}
          />
          {accountKind === "store" && (
            <>
              <WorkplaceActions branchId={branchId} />
              <Button type="button" variant="outline" asChild>
                <a
                  href="/staff/attendance/qr"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <QrCode size={17} />
                  Mostrar QR de asistencia
                </a>
              </Button>
            </>
          )}
          {accountKind !== "store" && (
            <ReplenishmentPanel
              actorId={actorId}
              role={role}
              refresh={refresh}
            />
          )}
          <Button
            variant="ghost"
            className="min-h-12"
            disabled={locked}
            onClick={refreshPrices}
          >
            <RotateCw size={17} />
            Actualizar carta
          </Button>
          {!showCart && (
            <Button onClick={newSale} disabled={locked}>
              <Plus size={17} />
              {lines.length ? "Continuar pedido" : "Nueva venta"}
            </Button>
          )}
        </div>
      </div>
      {accountKind === "store" && (
        <WorkplaceSummary key={branchId} branchId={branchId} />
      )}
      <div className="flex flex-wrap items-center gap-3 border-b border-line">
        <button
          disabled={locked || view === "append"}
          onClick={() => {
            if (view !== "new") newSale();
          }}
          className={`min-h-12 border-b-2 px-3 text-sm font-bold ${showCart ? "border-orange-500 text-brand" : "border-transparent text-muted"}`}
        >
          Nueva venta
        </button>
        <button
          disabled={locked || view === "append"}
          onClick={() => {
            setHistoryOpened(true);
            setReturnView("history");
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
            disabled={locked || view === "append"}
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
      {view !== "detail" && !paymentOpen && !cancelOpen && (
        <OperationNotice
          eventKey={operation.errorAttempt}
          error={operation.error}
          uncertain={operation.uncertain}
          busy={operation.busy}
          retry={operation.retry}
        />
      )}
      {error && (
        <OperationAlert
          eventKey={errorAttempt}
          tone="error"
          title="No pudimos completar la operación"
          message={error}
        />
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
      <div hidden={!showCart} className={showCart ? "contents" : "hidden"}>
        <div
          data-pos-workspace
          className="grid min-h-0 gap-3 flex-1 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_440px] 2xl:grid-cols-[minmax(0,1fr)_480px]"
        >
          <div
            data-pos-catalogue
            className={`${tabletPanel === "products" ? "flex" : "hidden"} min-h-0 min-w-0 flex-col gap-3 lg:flex`}
          >
            <div className="shrink-0">
              {isAppend && appendSale ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-blue-100 bg-blue-50 p-4">
                  <div>
                    <p className="text-sm font-bold text-brand">
                      Nuevo pedido · {appendSale.tableName}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      Venta #{appendSale.number} · saldo actual{" "}
                      {money(appendSale.balanceDue)}
                    </p>
                  </div>
                  <Button
                    disabled={locked}
                    variant="ghost"
                    onClick={() => {
                      if (savedDraft.current) {
                        restoreDraft(savedDraft.current.draft);
                        setReturnView(savedDraft.current.view);
                        savedDraft.current = null;
                      }
                      setDetail(appendSale);
                      activeDetailId.current = appendSale.id;
                      setAppendSale(null);
                      setView("detail");
                    }}
                  >
                    <ArrowLeft size={15} />
                    Volver a la cuenta
                  </Button>
                  <fieldset className="w-full min-w-0 border-t border-blue-100 pt-3">
                    <legend className="px-1 text-xs font-semibold text-muted">
                      Acciones
                    </legend>
                    <div className="mt-1 max-w-sm">{orderActions}</div>
                  </fieldset>
                </div>
              ) : (
                <OrderControls
                  origin={origin}
                  fulfillment={fulfillment}
                  locked={locked}
                  originLocked={lines.length > 0}
                  onOriginChange={changeOrigin}
                  onFulfillmentChange={(value) => {
                    setFulfillment(value);
                    setTableId("");
                  }}
                  actions={orderActions}
                />
              )}
            </div>
            {!isAppend &&
              (origin !== "counter" || fulfillment === "dine_in") && (
                <section className="surface-panel grid shrink-0 gap-3 p-3 sm:grid-cols-2">
                  {origin === "delivery" ? (
                    <>
                      <Control label="Plataforma" required>
                        <select
                          required
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
                      <Control label="Número del pedido externo" required>
                        <Input
                          required
                          value={externalId}
                          disabled={locked}
                          maxLength={80}
                          placeholder="Ej. 2280061098"
                          onChange={(e) => setExternalId(e.target.value)}
                        />
                      </Control>
                    </>
                  ) : origin === "table" ? (
                    <Control label="Mesa" required>
                      <select
                        required
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
                        <Control label="Mesa de consumo" optional>
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
                        onClick={(event) => {
                          if (
                            !event.metaKey &&
                            !event.ctrlKey &&
                            !event.shiftKey &&
                            !event.altKey
                          ) {
                            event.preventDefault();
                            void selectSale(selectedTable.saleId!);
                          }
                        }}
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
          <div
            data-pos-order
            className={`${tabletPanel === "order" ? "flex" : "hidden"} min-h-0 min-w-0 flex-col gap-2 lg:flex`}
          >
            <Button
              variant="outline"
              className="min-h-12 justify-start lg:hidden"
              onClick={() => setTabletPanel("products")}
            >
              <ArrowLeft size={18} />
              Seguir agregando productos
            </Button>
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
        {tabletPanel === "products" && (
          <div className="sticky bottom-0 z-10 bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
            <Button
              data-pos-order-summary
              className="min-h-16 w-full justify-between gap-4 rounded-xl px-5 text-base shadow-lg"
              onClick={() => setTabletPanel("order")}
            >
              <span className="flex items-center gap-3">
                <ShoppingBag size={22} />
                <span>
                  Ver pedido ·{" "}
                  {lines.reduce((sum, line) => sum + line.quantity, 0)} unid.
                </span>
              </span>
              <span
                className="flex items-center gap-3"
                aria-live="polite"
                aria-atomic="true"
              >
                {total === null ? "Revisar total" : money(total)}
                <ArrowRight size={20} />
              </span>
            </Button>
          </div>
        )}
      </div>
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
            <Control label="Observaciones del pedido" optional>
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
                setLocatorNumber(null);
                setLocatorMode("automatic");
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
      {(historyOpened || workspaceView === "history") && (
        <div hidden={workspaceView !== "history"}>
          <SaleHistory
            refresh={refresh}
            locked={locked}
            onSelect={(sale) => void selectSale(sale.id)}
          />
        </div>
      )}
      {view === "detail" && (
        <SaleDetailDialog
          actorId={actorId}
          sale={detail}
          loading={detailLoading}
          error={detailError}
          canCancel={role !== "staff"}
          canAdd={!appendSale}
          locked={operation.locked || fulfillmentBusy}
          onBusy={setFulfillmentBusy}
          onChanged={() => void refreshLocatorDetail()}
          onOpenSale={(id) => void selectSale(id)}
          onClose={closeSaleDetail}
          onRetry={() => {
            setDetailLoading(true);
            setDetailError("");
            void loadSaleDetail(activeDetailId.current);
          }}
          restoreFocus={() => {
            if (modalOpener.current?.isConnected)
              modalOpener.current.focus({ preventScroll: true });
            else
              document
                .querySelector<HTMLElement>("[data-pos-title]")
                ?.focus({ preventScroll: true });
          }}
          feedback={
            !paymentOpen && !cancelOpen ? (
              <OperationNotice
                eventKey={operation.errorAttempt}
                error={operation.error}
                uncertain={operation.uncertain}
                busy={operation.busy}
                retry={operation.retry}
              />
            ) : null
          }
          onPay={() => {
            operation.clearError();
            setPaymentOpen(true);
          }}
          onAdd={() => {
            if (!detail || appendSale) return;
            savedDraft.current = {
              view: returnView,
              draft: {
                lines,
                origin,
                channel,
                fulfillment,
                tableId,
                customerId,
                customerName,
                customerEmail,
                externalId,
                notes,
                locatorNumber,
                locatorMode,
                tabletPanel,
              },
            };
            setAppendSale(detail);
            setView("append");
            setTabletPanel("products");
            setLocatorNumber(null);
            setLocatorMode("automatic");
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
        />
      )}
      {paymentOpen && (
        <PaymentDialog
          eventKey={operation.errorAttempt}
          methods={paymentMethods}
          methodsError={methodsError}
          methodsLoading={methodsLoading}
          canManageMethods={role === "admin"}
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
          checkoutIssue={view === "detail" ? "" : locatorIssue || customerIssue}
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
              eventKey={operation.errorAttempt}
              error={operation.error}
              uncertain={operation.uncertain}
              busy={operation.busy}
              retry={operation.retry}
            />
            <Control label="Motivo de anulación" required>
              <Input
                required
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
                  required
                  onChange={(e) => setRefundConfirmed(e.target.checked)}
                />
                <span>
                  <FieldCaption required>
                    Confirmo que ya se devolvieron {money(detail.paidAmount)}{" "}
                    por los medios originales o que la plataforma confirmó su
                    devolución.
                  </FieldCaption>
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
