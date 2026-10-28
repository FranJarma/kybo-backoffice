"use client";
import { LocationSelect } from "@/components/branches/location-select";
import {
  ShippingEditor,
  blankShipping,
  shippingPreview,
} from "./shipping-editor";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  Plus,
  ArrowLeft,
  ArrowRight,
  Check,
  CreditCard,
  Info,
  PackageCheck,
  ReceiptText,
  Search,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { FieldCaption } from "@/components/ui/field-caption";
import { OperationAlert } from "@/components/ui/operation-alert";
import { useErrorFeedback } from "@/components/ui/use-error-feedback";
import {
  cents,
  decimal,
  exactDivision,
  integer,
  safeQuantity,
  SCALE,
} from "@/modules/inventory/decimal";
import type { CatalogRow } from "@/modules/catalog/types";
import type { PurchaseOrder } from "@/modules/procurement/types";
import type {
  ReceiptDetail,
  ReceiptLineInput,
  ReceiptSummary,
  ReceiveInput,
  PaymentInput,
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

type LineDraft = {
  orderLineId?: string;
  snapshotFactor?: string;
  itemId: string;
  item?: CatalogRow;
  presentationId: string;
  presentation?: CatalogRow;
  quantity: string;
  unitPrice: string;
  discount: string;
  lotCode: string;
  expiresOn: string;
};
const blankLine = (): LineDraft => ({
  itemId: "",
  presentationId: "",
  quantity: "",
  unitPrice: "",
  discount: "",
  lotCode: "",
  expiresOn: "",
});
function AdvanceReceiptPreview({
  order,
  lines,
  shipping,
}: {
  order: PurchaseOrder;
  lines: LineDraft[];
  shipping: ReturnType<typeof blankShipping>;
}) {
  const financial = order.financial;
  if (!financial || integer(financial.availableAmount) <= 0n) return null;
  const credit = integer(financial.availableAmount),
    preview = shippingPreview(lines, shipping);
  if (preview.total === null)
    return (
      <div className="rounded-lg bg-blue-50 p-4 text-sm">
        <p className="font-semibold">
          Anticipo disponible: {money(financial.availableAmount)}
        </p>
        <p className="mt-2 text-xs leading-5 text-muted">
          El costo está pendiente. El anticipo se conserva sin aplicar hasta
          conocer el importe de la mercadería.
        </p>
      </div>
    );
  const payable =
      preview.total + (shipping.recipient === "supplier" ? preview.cost : 0n),
    applied = credit < payable ? credit : payable;
  return (
    <div className="space-y-2 rounded-lg bg-blue-50 p-4 text-sm">
      <p>
        Anticipo a aplicar: <strong>{money(cents(applied))}</strong>
      </p>
      <p>
        Crédito restante: <strong>{money(cents(credit - applied))}</strong>
      </p>
      <p className="text-xs leading-5 text-muted">
        Este dinero ya está pagado. La recepción no genera otra salida por el
        anticipo.
      </p>
    </div>
  );
}
function basePreview(line: LineDraft) {
  const amount = integer(decimal(line.quantity, 6, true, true)!);
  const factor = line.snapshotFactor
    ? integer(line.snapshotFactor)
    : line.presentation
      ? integer(String(line.presentation.baseQuantity))
      : SCALE;
  return safeQuantity(exactDivision(amount * factor, SCALE));
}
function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
  disabled,
  placeholder,
  unit,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  required?: boolean;
  disabled?: boolean;
  placeholder?: string;
  unit?: string;
  inputMode?: "decimal";
}) {
  return (
    <label className="block min-w-0 text-sm font-medium text-brand">
      <FieldCaption
        required={!disabled && required}
        optional={!disabled && !required}
      >
        {label}
      </FieldCaption>
      <span className="relative mt-2 flex">
        <Input
          className={unit ? "pr-20 tabular-nums" : ""}
          type={type}
          inputMode={inputMode}
          value={value}
          required={required}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
        {unit && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-px right-px flex w-16 items-center justify-center rounded-r-lg border-l border-line bg-surface text-xs font-medium text-muted"
          >
            {unit}
          </span>
        )}
      </span>
    </label>
  );
}
function PaymentStatus({ receipt }: { receipt: ReceiptSummary }) {
  const pendingCost = receipt.totalAmount === null;
  const paid =
    !pendingCost &&
    receipt.balanceDue !== null &&
    integer(receipt.balanceDue) === 0n &&
    integer(receipt.shippingBalanceDue) === 0n;
  const partial =
    !pendingCost &&
    !paid &&
    integer(receipt.paidAmount) + integer(receipt.shippingPaidAmount) > 0n;
  return (
    <span
      className={`inline-flex w-fit items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold ${pendingCost ? "bg-slate-100 text-slate-600" : paid ? "bg-emerald-50 text-emerald-700" : partial ? "bg-blue-50 text-blue-700" : "bg-amber-50 text-amber-700"}`}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {pendingCost
        ? "Costo pendiente"
        : paid
          ? "Pagada"
          : partial
            ? "Pago parcial"
            : "Pendiente de pago"}
    </span>
  );
}
export function PurchasesManager({
  actorId,
  timeZone,
  order,
  onOrderClose,
  onOrderReceived,
  embedded = false,
  onBusy,
}: {
  actorId: string;
  timeZone: string;
  order?: PurchaseOrder;
  onOrderClose?: () => void;
  onOrderReceived?: () => void;
  embedded?: boolean;
  onBusy?: (busy: boolean) => void;
}) {
  const [rows, setRows] = useState<ReceiptSummary[]>([]),
    [total, setTotal] = useState(0),
    [search, setSearch] = useState("");
  const [loadError, setLoadError, loadErrorAttempt] = useErrorFeedback(),
    [detail, setDetail] = useState<ReceiptDetail | null>(null),
    [view, setView] = useState<"list" | "draft" | "review" | "detail">(
      order ? "draft" : "list",
    );
  const [supplierId, setSupplierId] = useState(order?.supplierId ?? ""),
    [locationId, setLocationId] = useState(""),
    [supplier, setSupplier] = useState<CatalogRow | undefined>(
      order
        ? {
            id: order.supplierId,
            name: order.supplierName,
            revision: 1,
            archivedAt: null,
          }
        : undefined,
    ),
    [receivedOn, setReceivedOn] = useState(today(timeZone));
  const [documentNumber, setDocumentNumber] = useState(""),
    [notes, setNotes] = useState(""),
    [lines, setLines] = useState<LineDraft[]>(() =>
      order
        ? order.lines
            .filter((l) => integer(l.pendingQuantity) > 0n)
            .map((l) => ({
              ...blankLine(),
              itemId: l.itemId,
              orderLineId: l.id,
              snapshotFactor: l.conversionFactor,
              item: {
                id: l.itemId,
                name: l.itemName,
                baseUnit: l.baseUnit,
                revision: 1,
                archivedAt: null,
              },
              presentationId: l.presentationId ?? "",
              presentation: l.presentationId
                ? {
                    id: l.presentationId,
                    name: l.presentationName ?? "Presentación del pedido",
                    baseQuantity: l.conversionFactor,
                    revision: 1,
                    archivedAt: null,
                  }
                : undefined,
              // A partial pack receipt can leave a nonrepresentable pack fraction. Ask
              // for an explicit quantity in that exceptional case instead of rounding.
              quantity:
                (integer(l.pendingQuantity) * SCALE) %
                  integer(l.conversionFactor) ===
                0n
                  ? safeQuantity(
                      exactDivision(
                        integer(l.pendingQuantity) * SCALE,
                        integer(l.conversionFactor),
                      ),
                    ).replace(".", ",")
                  : "",
            }))
        : [blankLine()],
    );
  const [payment, setPayment] = useState(false),
    [paymentSource, setPaymentSource] = useState<"cash" | "external">(
      "external",
    ),
    [paymentMethodId, setPaymentMethodId] = useState(""),
    [paidOn, setPaidOn] = useState(today(timeZone)),
    [amount, setAmount] = useState(""),
    [reference, setReference] = useState("");
  const [refreshWarning, setRefreshWarning] = useState("");
  const [reviewError, setReviewError, reviewErrorAttempt] = useErrorFeedback();
  const [shipping, setShipping] = useState(blankShipping);
  const [paymentTarget, setPaymentTarget] = useState<"supplier" | "shipping">(
    "supplier",
  );
  useEffect(() => {
    if (!order) return;
    let active = true;
    getJson<{ locations: { id: string; code: string }[] }>(
      "/api/branches/current",
    )
      .then((data) => {
        const depot = data.locations.find((l) => l.code === "DEPOSITO");
        if (active && depot) setLocationId((current) => current || depot.id);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [order]);
  const refreshList = useCallback(async () => {
    try {
      const data = await getJson<{ rows: ReceiptSummary[]; total: number }>(
        `/api/purchases?q=${encodeURIComponent(search)}`,
      );
      setRows(data.rows);
      setTotal(data.total);
      setLoadError("");
      return true;
    } catch {
      setLoadError("No pudimos actualizar las recepciones. Probá de nuevo.");
      return false;
    }
  }, [search, setLoadError]);
  useEffect(() => {
    const timer = setTimeout(() => void refreshList(), search ? 250 : 0);
    return () => clearTimeout(timer);
  }, [refreshList, search]);
  const showDetail = useCallback(
    async (id: string) => {
      try {
        const data = await getJson<{ receipt: ReceiptDetail }>(
          `/api/purchases/${id}`,
        );
        setDetail(data.receipt);
        setPayment(false);
        setPaymentMethodId("");
        setAmount("");
        setReference("");
        setPaidOn(today(timeZone));
        setView("detail");
        setLoadError("");
      } catch {
        setLoadError("No pudimos cargar el detalle de la recepción.");
      }
    },
    [timeZone, setLoadError],
  );
  const onReceived = useCallback(
    (result: unknown) => {
      const receipt = (result as { receipt: ReceiptDetail }).receipt;
      setDetail(receipt);
      setPayment(false);
      setPaymentMethodId("");
      setAmount("");
      setReference("");
      setPaidOn(today(timeZone));
      setView("detail");
      setRefreshWarning("");
      onOrderReceived?.();
      void refreshList().then((ok) => {
        if (!ok)
          setRefreshWarning(
            "La recepción quedó confirmada, pero no pudimos actualizar el listado.",
          );
      });
    },
    [refreshList, timeZone, onOrderReceived],
  );
  const receiptOperation = useOperation<ReceiveInput>(
    actorId,
    "receipt",
    onReceived,
  );
  const onPaid = useCallback(
    (result: unknown) => {
      setDetail((result as { receipt: ReceiptDetail }).receipt);
      setView("detail");
      setPayment(false);
      setAmount("");
      setReference("");
      setPaymentMethodId("");
      setRefreshWarning("");
      void refreshList().then((ok) => {
        if (!ok)
          setRefreshWarning(
            "El pago quedó registrado, pero no pudimos actualizar el listado.",
          );
      });
    },
    [refreshList],
  );
  const paymentOperation = useOperation<PaymentInput>(
    actorId,
    "payment",
    onPaid,
  );
  const locked = receiptOperation.locked || paymentOperation.locked;
  useEffect(() => {
    onBusy?.(locked);
    return () => onBusy?.(false);
  }, [locked, onBusy]);
  const updateLine = (index: number, change: Partial<LineDraft>) =>
    setLines((current) =>
      current.map((row, i) => (i === index ? { ...row, ...change } : row)),
    );
  function begin() {
    setShipping(blankShipping());
    setPayment(false);
    setPaymentMethodId("");
    setAmount("");
    setReference("");
    setPaidOn(today(timeZone));
    setSupplierId("");
    setSupplier(undefined);
    setReceivedOn(today(timeZone));
    setDocumentNumber("");
    setNotes("");
    setLines([blankLine()]);
    setReviewError("");
    setView("draft");
    receiptOperation.clearError();
  }
  function review(event: FormEvent) {
    event.preventDefault();
    try {
      lines.forEach((line) => {
        const base = basePreview(line);
        const pending = order?.lines.find(
          (l) => l.id === line.orderLineId,
        )?.pendingQuantity;
        if (pending && integer(base) > integer(pending))
          throw new Error(
            `La cantidad de ${line.item?.name} supera lo pendiente del pedido.`,
          );
        if (line.unitPrice.trim()) decimal(line.unitPrice, 6);
        if (line.discount.trim()) decimal(line.discount, 2);
      });
      const preview = shippingPreview(lines, shipping);
      if (
        preview.cost > 0n &&
        shipping.recipient === "carrier" &&
        (!shipping.carrierId || shipping.carrierId === supplierId)
      )
        throw new Error(
          "Elegí un transportista distinto o indicá que cobra el proveedor de mercadería.",
        );
      setReviewError("");
      setView("review");
    } catch (error) {
      setReviewError(
        error instanceof Error ? error.message : "Revisá las cantidades.",
      );
    }
  }
  function confirmReceipt() {
    const payload: ReceiveInput = {
      requestId: crypto.randomUUID(),
      ...(order
        ? { purchaseOrderId: order.id, expectedOrderRevision: order.revision }
        : {}),
      supplierId,
      locationId,
      receivedOn,
      documentNumber: documentNumber.trim() || null,
      notes: notes.trim() || null,
      ...(shippingPreview(lines, shipping).cost > 0n
        ? {
            shipping: {
              amount: shipping.amount,
              supplierId:
                shipping.recipient === "supplier"
                  ? supplierId
                  : shipping.carrierId,
              allocation: shipping.allocation,
              ...(shipping.allocation === "manual"
                ? { amounts: lines.map((_, i) => shipping.amounts[i] || "0") }
                : {}),
            },
          }
        : {}),
      lines: lines.map((line): ReceiptLineInput => ({
        ...(line.orderLineId ? { orderLineId: line.orderLineId } : {}),
        itemId: line.itemId,
        itemRevision: line.item?.revision,
        presentationRevision: line.presentation?.revision,
        presentationId: line.presentationId || null,
        quantity: line.quantity,
        unitPrice: line.unitPrice.trim() || null,
        discount: line.discount.trim() || "0",
        lotCode: line.lotCode.trim() || null,
        expiresOn: line.expiresOn || null,
      })),
    };
    receiptOperation.submit("/api/purchases", payload);
  }
  function confirmPayment(event: FormEvent) {
    event.preventDefault();
    if (!detail) return;
    paymentOperation.submit(`/api/purchases/${detail.id}/payments`, {
      target: paymentTarget,
      requestId: crypto.randomUUID(),
      paidOn,
      paymentMethodId,
      source: paymentSource,
      amount,
      reference: reference.trim() || null,
    });
  }
  return (
    <div className="space-y-6">
      <header className="page-heading">
        <div className="min-w-0">
          <h1 className={embedded ? "text-lg font-semibold" : "page-title"}>
            {order ? "Recibir pedido" : "Recepciones"}
          </h1>
          <p className="page-description">
            {order
              ? `Pedido de ${order.supplierName}. Ajustá las cantidades a lo que llegó y quitá los insumos que todavía no recibiste. El resto seguirá pendiente.`
              : "Registrá lo que efectivamente llegó y revisá las cantidades antes de confirmar."}
          </p>
        </div>
        {order ? (
          <Button variant="outline" onClick={onOrderClose} disabled={locked}>
            Volver al pedido
          </Button>
        ) : view === "list" ? (
          <Button type="button" onClick={begin} disabled={locked}>
            <Plus aria-hidden="true" /> Nueva recepción
          </Button>
        ) : (
          <Button
            type="button"
            variant="outline"
            onClick={() => setView("list")}
            disabled={locked || paymentOperation.locked}
          >
            <ArrowLeft aria-hidden="true" /> Volver al listado
          </Button>
        )}
      </header>
      <OperationAlert
        title="No pudimos cargar las recepciones"
        message={loadError}
        eventKey={loadErrorAttempt}
        tone="error"
      />
      <OperationAlert
        title="No pudimos confirmar la recepción"
        eventKey={receiptOperation.errorAttempt}
        message={
          !receiptOperation.error
            ? ""
            : receiptOperation.error +
              (receiptOperation.status === 409
                ? " El catálogo o la recepción cambió. Volvé a editar y seleccioná de nuevo los artículos y presentaciones antes de revisar."
                : "")
        }
        tone="error"
      />
      <OperationAlert
        title="No pudimos registrar el pago"
        message={paymentOperation.error}
        eventKey={paymentOperation.errorAttempt}
        tone="error"
      />
      {(receiptOperation.uncertain || paymentOperation.uncertain) && (
        <Card className="gap-3 border-amber-200 bg-amber-50 p-5" role="status">
          <strong className="text-amber-900">
            Operación pendiente de confirmar
          </strong>
          <p className="text-sm leading-6 text-amber-900">
            {receiptOperation.uncertain
              ? "La recepción está pendiente de confirmar."
              : "El pago está pendiente de confirmar."}{" "}
            Reintentá el mismo envío para confirmar el resultado.
          </p>
          <Button
            className="self-start"
            type="button"
            disabled={receiptOperation.busy || paymentOperation.busy}
            onClick={
              receiptOperation.uncertain
                ? receiptOperation.retry
                : paymentOperation.retry
            }
          >
            Reintentar el mismo envío
          </Button>
        </Card>
      )}
      {view === "list" && (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <label className="relative block w-full sm:max-w-md">
              <span className="sr-only">Buscar recepción</span>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted"
              />
              <Input
                type="search"
                className="bg-white pl-11"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar por proveedor o comprobante…"
              />
            </label>
            <p className="shrink-0 text-sm text-muted">
              {total}{" "}
              {total === 1 ? "recepción registrada" : "recepciones registradas"}
            </p>
          </div>
          <Card className="gap-0 overflow-hidden p-0">
            {rows.length ? (
              <>
                <div className="overflow-x-auto">
                  <table className="block w-full text-left text-sm lg:table">
                    <caption className="sr-only">
                      Recepciones registradas
                    </caption>
                    <thead className="hidden border-b border-line bg-surface/70 text-xs font-medium text-muted lg:table-header-group">
                      <tr>
                        <th scope="col" className="px-5 py-4 font-medium">
                          Proveedor
                        </th>
                        <th scope="col" className="px-4 py-4 font-medium">
                          Fecha
                        </th>
                        <th scope="col" className="px-4 py-4 font-medium">
                          Comprobante
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-4 text-right font-medium"
                        >
                          Total
                        </th>
                        <th scope="col" className="px-4 py-4 font-medium">
                          Estado de pago
                        </th>
                        <th scope="col" className="px-5 py-4">
                          <span className="sr-only">Acciones</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="block divide-y divide-line lg:table-row-group">
                      {rows.map((row) => (
                        <tr
                          key={row.id}
                          className="grid grid-cols-2 gap-x-4 gap-y-4 p-5 transition-colors hover:bg-surface/40 lg:table-row lg:p-0"
                        >
                          <td className="col-span-2 min-w-0 lg:max-w-60 lg:px-5 lg:py-5">
                            <div className="flex items-center gap-3">
                              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                                <ReceiptText
                                  aria-hidden="true"
                                  className="size-5"
                                />
                              </span>
                              <div className="min-w-0">
                                <p className="break-words font-semibold text-brand">
                                  {row.supplierName}
                                </p>
                                <p className="mt-1 text-xs text-muted">
                                  {row.lineCount} renglón
                                  {row.lineCount === 1 ? "" : "es"}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="min-w-0 lg:px-4 lg:py-5">
                            <span className="mb-1 block text-xs text-muted lg:hidden">
                              Fecha
                            </span>
                            <span className="whitespace-nowrap text-muted">
                              {date(row.receivedOn)}
                            </span>
                          </td>
                          <td className="min-w-0 lg:max-w-40 lg:px-4 lg:py-5">
                            <span className="mb-1 block text-xs text-muted lg:hidden">
                              Comprobante
                            </span>
                            <span className="break-words text-muted">
                              {row.documentNumber || "Sin comprobante"}
                            </span>
                          </td>
                          <td className="min-w-0 lg:px-4 lg:py-5 lg:text-right">
                            <span className="mb-1 block text-xs text-muted lg:hidden">
                              Total
                            </span>
                            <p className="whitespace-nowrap font-semibold text-brand tabular-nums">
                              {money(row.landedAmount)}
                            </p>
                          </td>
                          <td className="min-w-0 lg:px-4 lg:py-5">
                            <PaymentStatus receipt={row} />
                            <p className="mt-1.5 text-xs text-muted tabular-nums">
                              Saldo: {money(row.balanceDue)}
                              {Number(row.shippingBalanceDue) > 0 && (
                                <span className="block">
                                  Envío pendiente:{" "}
                                  {money(row.shippingBalanceDue)}
                                </span>
                              )}
                            </p>
                          </td>
                          <td className="col-span-2 border-t border-line pt-3 text-right lg:border-0 lg:px-5 lg:py-5">
                            <Button
                              type="button"
                              variant="ghost"
                              className="w-full text-blue-600 lg:w-auto"
                              onClick={() => void showDetail(row.id)}
                            >
                              Ver detalle{" "}
                              <ArrowRight
                                aria-hidden="true"
                                className="size-4"
                              />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="border-t border-line px-5 py-4 text-xs text-muted">
                  {rows.length} de {total} recepciones · Se muestran las más
                  recientes
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center px-6 py-14 text-center">
                <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                  <PackageCheck aria-hidden="true" className="size-7" />
                </span>
                <h2 className="text-base font-semibold text-brand">
                  {search
                    ? "No encontramos recepciones"
                    : "Todavía no hay recepciones para mostrar."}
                </h2>
                <p className="mt-2 max-w-sm text-sm leading-6 text-muted">
                  {search
                    ? "Probá con otro proveedor o número de comprobante."
                    : "Registrá una recepción para sumar la mercadería que llegó a tu inventario."}
                </p>
              </div>
            )}
          </Card>
        </>
      )}
      {(view === "draft" || view === "review") && (
        <div className="space-y-5">
          <div className="flex items-center gap-3 text-sm">
            <span
              className={`flex size-7 items-center justify-center rounded-full text-xs font-bold ${view === "draft" ? "bg-blue-600 text-white" : "bg-blue-100 text-blue-700"}`}
            >
              {view === "review" ? (
                <Check aria-hidden="true" className="size-4" />
              ) : (
                "1"
              )}
            </span>
            <span
              className={
                view === "draft" ? "font-semibold text-brand" : "text-muted"
              }
            >
              <span className="sm:hidden">Datos</span>
              <span className="hidden sm:inline">Datos de la recepción</span>
            </span>
            <span aria-hidden="true" className="h-px w-8 bg-line" />
            <span
              className={`flex size-7 items-center justify-center rounded-full text-xs font-bold ${view === "review" ? "bg-blue-600 text-white" : "border border-line bg-white text-muted"}`}
            >
              2
            </span>
            <span
              className={
                view === "review" ? "font-semibold text-brand" : "text-muted"
              }
            >
              Revisión
            </span>
          </div>
          {view === "draft" ? (
            <form
              onSubmit={review}
              className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_300px]"
            >
              <fieldset disabled={locked} className="min-w-0 space-y-5">
                <Card className="gap-5 p-5 sm:p-6">
                  <div>
                    <h2 className="text-lg font-bold text-brand">
                      Datos de la recepción
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      Elegí el proveedor y completá la información del
                      comprobante.
                    </p>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <LocationSelect
                      value={locationId}
                      onChange={setLocationId}
                      disabled={locked}
                    />
                    <SearchSelect
                      entity="suppliers"
                      label="Proveedor"
                      value={supplierId}
                      initial={supplier}
                      disabled={!!order}
                      onChange={(id, row) => {
                        setSupplierId(id);
                        setSupplier(row);
                        setLines((old) =>
                          old.map((line) => ({
                            ...line,
                            presentationId: "",
                            presentation: undefined,
                          })),
                        );
                      }}
                      required
                    />
                    <Field
                      label="Fecha de recepción"
                      type="date"
                      required
                      value={receivedOn}
                      onChange={setReceivedOn}
                    />
                    <Field
                      label="Comprobante externo"
                      value={documentNumber}
                      onChange={setDocumentNumber}
                      placeholder="Número de factura o remito"
                    />
                    <Field
                      label="Notas"
                      value={notes}
                      onChange={setNotes}
                      placeholder="Información adicional (opcional)"
                    />
                  </div>
                </Card>
                <div className="flex items-center justify-between gap-3 px-1">
                  <h2 className="text-lg font-bold text-brand">
                    Mercadería recibida
                  </h2>
                  <span className="text-xs text-muted">
                    {lines.length} de 30 renglones
                  </span>
                </div>
                {lines.map((line, index) => (
                  <Card key={index} className="gap-0 overflow-hidden p-0">
                    <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4 sm:px-6">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-sm font-bold text-blue-600">
                          {index + 1}
                        </span>
                        <h3 className="truncate font-semibold text-brand">
                          Renglón {index + 1}
                        </h3>
                      </div>
                      {lines.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          className="text-muted hover:text-red-700"
                          onClick={() => {
                            setLines((old) =>
                              old.filter((_, i) => i !== index),
                            );
                            setShipping((old) => ({
                              ...old,
                              amounts: old.amounts.filter(
                                (_, i) => i !== index,
                              ),
                            }));
                          }}
                        >
                          <Trash2 aria-hidden="true" className="size-4" />{" "}
                          Quitar
                        </Button>
                      )}
                    </div>
                    <div className="space-y-5 p-5 sm:p-6">
                      <div className="grid gap-4 sm:grid-cols-2">
                        <SearchSelect
                          entity="items"
                          label="Artículo"
                          value={line.itemId}
                          initial={line.item}
                          disabled={!!order}
                          onChange={(id, row) =>
                            updateLine(index, {
                              itemId: id,
                              item: row,
                              presentationId: "",
                              presentation: undefined,
                            })
                          }
                          required
                        />
                        <SearchSelect
                          entity="presentations"
                          label="Presentación"
                          value={line.presentationId}
                          initial={line.presentation}
                          onChange={(id, row) =>
                            updateLine(index, {
                              presentationId: id,
                              presentation: row,
                            })
                          }
                          filter={(row) =>
                            row.itemId === line.itemId &&
                            row.supplierId === supplierId
                          }
                          disabled={!!order || !line.itemId || !supplierId}
                        />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
                        <Field
                          label={
                            line.presentationId
                              ? "Cantidad recibida (presentaciones)"
                              : "Cantidad recibida"
                          }
                          required
                          inputMode="decimal"
                          unit={
                            line.presentationId
                              ? "present."
                              : line.item?.baseUnit === "unit"
                                ? "unid."
                                : String(line.item?.baseUnit || "unidad")
                          }
                          value={line.quantity}
                          onChange={(quantity) =>
                            updateLine(index, { quantity })
                          }
                          placeholder="0"
                        />
                        <Field
                          label={
                            line.presentationId
                              ? "Precio por presentación"
                              : `Precio por ${line.item?.baseUnit === "unit" ? "unidad" : line.item?.baseUnit || "unidad base"}`
                          }
                          inputMode="decimal"
                          unit="ARS"
                          value={line.unitPrice}
                          onChange={(unitPrice) =>
                            updateLine(index, { unitPrice })
                          }
                          placeholder="Opcional"
                        />
                        <Field
                          label="Descuento del renglón"
                          inputMode="decimal"
                          unit="ARS"
                          value={line.discount}
                          onChange={(discount) =>
                            updateLine(index, { discount })
                          }
                          placeholder="0"
                        />
                        <Field
                          label="Código de lote"
                          value={line.lotCode}
                          onChange={(lotCode) => updateLine(index, { lotCode })}
                          placeholder="Opcional"
                        />
                        <Field
                          label="Vencimiento"
                          type="date"
                          value={line.expiresOn}
                          onChange={(expiresOn) =>
                            updateLine(index, { expiresOn })
                          }
                        />
                      </div>
                      <p className="flex items-start gap-2 rounded-lg bg-blue-50/70 p-3 text-xs leading-5 text-muted">
                        <Info
                          aria-hidden="true"
                          className="mt-0.5 size-4 shrink-0 text-blue-600"
                        />
                        <span>
                          {line.presentation ? (
                            <>
                              Cada presentación de «
                              {String(line.presentation.name)}» equivale a{" "}
                              {quantity(
                                String(line.presentation.baseQuantity),
                                String(line.item?.baseUnit || ""),
                              )}
                              . Cargá la cantidad de presentaciones y el precio
                              de una. Por ejemplo, si elegiste una caja de 12
                              envases, ingresá 1 por cada caja recibida. El
                              inventario se convierte automáticamente.
                            </>
                          ) : (
                            <>
                              Elegí una presentación para comprar por envase o
                              caja. Sin presentación, cantidad y precio
                              corresponden a la unidad base{" "}
                              {line.item?.baseUnit || "del artículo"}.
                            </>
                          )}{" "}
                          Usá coma para los decimales.
                        </span>
                      </p>
                    </div>
                  </Card>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  className="w-full border-dashed bg-white"
                  disabled={!!order || locked || lines.length >= 30}
                  onClick={() => setLines((old) => [...old, blankLine()])}
                >
                  <Plus aria-hidden="true" /> Agregar renglón
                </Button>
                <ShippingEditor
                  lines={lines}
                  draft={shipping}
                  onChange={setShipping}
                  supplierName={supplier?.name ?? ""}
                />
              </fieldset>
              <aside className="space-y-4 xl:sticky xl:top-24">
                <Card className="gap-5 p-5 sm:p-6">
                  <h2 className="text-lg font-bold text-brand">
                    Resumen de la recepción
                  </h2>
                  <dl className="divide-y divide-line text-sm">
                    <div className="flex justify-between gap-4 pb-3">
                      <dt className="text-muted">Proveedor</dt>
                      <dd className="max-w-[65%] break-words text-right font-semibold text-brand">
                        {supplier?.name || "Sin seleccionar"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 py-3">
                      <dt className="text-muted">Fecha</dt>
                      <dd className="text-right font-medium text-brand">
                        {receivedOn ? date(receivedOn) : "Sin fecha"}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 py-3">
                      <dt className="text-muted">Renglones</dt>
                      <dd className="font-semibold text-brand">
                        {lines.length}
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4 pt-3">
                      <dt className="text-muted">Con precio informado</dt>
                      <dd className="font-semibold text-brand">
                        {lines.filter((line) => line.unitPrice.trim()).length}{" "}
                        de {lines.length}
                      </dd>
                    </div>
                  </dl>
                  <p className="text-xs leading-5 text-muted">
                    Podés recibir mercadería sin precio. Si falta algún precio,
                    el total quedará pendiente.
                  </p>
                </Card>
                <Card className="gap-3 p-5">
                  <OperationAlert
                    title="Revisá los datos de la recepción"
                    message={reviewError}
                    eventKey={reviewErrorAttempt}
                    tone="error"
                  />
                  <Button type="submit" className="w-full" disabled={locked}>
                    Revisar recepción <ArrowRight aria-hidden="true" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={locked}
                    onClick={() => (order ? onOrderClose?.() : setView("list"))}
                  >
                    Cancelar
                  </Button>
                  <p className="text-center text-xs leading-5 text-muted">
                    Revisá las cantidades antes de confirmar el ingreso al
                    stock.
                  </p>
                </Card>
              </aside>
            </form>
          ) : (
            <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
              <div className="min-w-0 space-y-5">
                <Card className="gap-5 p-5 sm:p-6">
                  <div>
                    <h2 className="text-lg font-bold text-brand">
                      Revisá la mercadería recibida
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      Verificá los datos y la conversión a unidades de stock.
                    </p>
                  </div>
                  <dl className="grid gap-x-6 gap-y-5 text-sm sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-muted">Proveedor</dt>
                      <dd className="mt-1 font-semibold text-brand">
                        {supplier?.name}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Fecha</dt>
                      <dd className="mt-1 font-medium text-brand">
                        {date(receivedOn)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Comprobante</dt>
                      <dd className="mt-1 break-words text-brand">
                        {documentNumber || "Sin comprobante"}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted">Notas</dt>
                      <dd className="mt-1 break-words text-brand">
                        {notes || "—"}
                      </dd>
                    </div>
                  </dl>
                </Card>
                <Card className="gap-0 overflow-hidden p-0">
                  <div className="border-b border-line px-5 py-4 sm:px-6">
                    <h3 className="font-bold text-brand">
                      Detalle de artículos{" "}
                      <span className="ml-1 text-sm font-normal text-muted">
                        ({lines.length})
                      </span>
                    </h3>
                  </div>
                  <div className="divide-y divide-line">
                    {lines.map((line, index) => (
                      <div className="space-y-4 p-5 sm:p-6" key={index}>
                        <div className="flex items-start gap-3">
                          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                            <PackageCheck
                              aria-hidden="true"
                              className="size-4"
                            />
                          </span>
                          <div className="min-w-0">
                            <h4 className="break-words font-semibold text-brand">
                              {line.item?.name}
                            </h4>
                            <p className="mt-1 text-sm text-muted">
                              {quantity(decimal(line.quantity, 6)!)} ×{" "}
                              {line.presentation?.name ||
                                (line.item?.baseUnit === "unit"
                                  ? "unidad"
                                  : line.item?.baseUnit)}
                            </p>
                          </div>
                          <div className="ml-auto shrink-0 text-right">
                            <p className="text-xs text-muted">
                              Ingreso al stock
                            </p>
                            <p className="mt-1 font-bold text-brand tabular-nums">
                              {quantity(
                                basePreview(line),
                                String(line.item?.baseUnit || ""),
                              )}
                            </p>
                          </div>
                        </div>
                        <dl className="grid grid-cols-2 gap-4 rounded-lg bg-surface p-3 text-xs sm:grid-cols-4">
                          <div>
                            <dt className="text-muted">Precio</dt>
                            <dd className="mt-1 font-medium text-brand">
                              {line.unitPrice
                                ? `${line.unitPrice} ARS`
                                : "Pendiente"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted">Descuento</dt>
                            <dd className="mt-1 font-medium text-brand">
                              {line.discount || "0"} ARS
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted">Lote</dt>
                            <dd className="mt-1 break-words font-medium text-brand">
                              {line.lotCode || "Sin código"}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-muted">Vencimiento</dt>
                            <dd className="mt-1 font-medium text-brand">
                              {line.expiresOn
                                ? date(line.expiresOn)
                                : "Sin fecha"}
                            </dd>
                          </div>
                        </dl>
                      </div>
                    ))}
                  </div>
                </Card>
                <ShippingEditor
                  lines={lines}
                  draft={shipping}
                  onChange={setShipping}
                  supplierName={supplier?.name ?? ""}
                  readOnly
                />
              </div>
              <aside className="space-y-4 xl:sticky xl:top-24">
                <Card className="gap-4 p-5 sm:p-6">
                  <h3 className="text-lg font-bold text-brand">
                    Confirmar ingreso
                  </h3>
                  {order && (
                    <AdvanceReceiptPreview
                      order={order}
                      lines={lines}
                      shipping={shipping}
                    />
                  )}
                  <div className="rounded-lg bg-surface p-4">
                    <p className="text-xs text-muted">Costo de la recepción</p>
                    <p className="mt-1 font-semibold text-brand">
                      Incluye mercadería y envío
                    </p>
                    <p className="mt-2 text-xs leading-5 text-muted">
                      Revisá el desglose de mercadería y envío antes de
                      confirmar.
                    </p>
                  </div>
                  <p className="flex items-start gap-2 text-xs leading-5 text-muted">
                    <Info
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0 text-blue-600"
                    />
                    <span>
                      La confirmación genera lotes y movimientos y no se puede
                      editar después.
                    </span>
                  </p>
                  {receiptOperation.uncertain ? (
                    <Button
                      type="button"
                      className="h-auto min-h-11 w-full whitespace-normal"
                      disabled={receiptOperation.busy}
                      onClick={receiptOperation.retry}
                    >
                      Reintentar desde este formulario
                    </Button>
                  ) : (
                    <Button
                      type="button"
                      className="w-full"
                      disabled={locked}
                      onClick={confirmReceipt}
                    >
                      <Check aria-hidden="true" />{" "}
                      {receiptOperation.busy
                        ? "Confirmando…"
                        : "Confirmar recepción"}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    disabled={locked}
                    onClick={() => {
                      if (receiptOperation.status === 409)
                        setLines((old) =>
                          old.map((item) => ({
                            ...item,
                            itemId: "",
                            item: undefined,
                            presentationId: "",
                            presentation: undefined,
                          })),
                        );
                      setView("draft");
                    }}
                  >
                    <ArrowLeft aria-hidden="true" /> Volver a editar
                  </Button>
                </Card>
              </aside>
            </div>
          )}
        </div>
      )}
      {view === "detail" && detail && (
        <div className="space-y-5">
          {refreshWarning && (
            <p
              role="status"
              className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800"
            >
              {refreshWarning}
            </p>
          )}
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="min-w-0 space-y-5">
              <Card className="gap-0 overflow-hidden p-0">
                <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line p-5 sm:p-6">
                  <div className="min-w-0">
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700">
                      <Check aria-hidden="true" className="size-3.5" />{" "}
                      Confirmada
                    </span>
                    <h2 className="mt-3 break-words text-xl font-bold text-brand">
                      {detail.supplierName}
                    </h2>
                    <p className="mt-1 break-words text-sm text-muted">
                      {date(detail.receivedOn)} ·{" "}
                      {detail.documentNumber || "Sin comprobante"}
                    </p>
                  </div>
                  <span className="text-xs text-muted">
                    {detail.lines.length} renglón
                    {detail.lines.length === 1 ? "" : "es"}
                  </span>
                </div>
                <div className="divide-y divide-line">
                  {detail.lines.map((line) => (
                    <div key={line.id} className="space-y-3 p-5 sm:p-6">
                      <div className="flex items-start gap-3">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                          <PackageCheck aria-hidden="true" className="size-5" />
                        </span>
                        <div className="min-w-0">
                          <h3 className="break-words text-sm font-semibold text-brand">
                            {line.itemName}
                          </h3>
                          <p className="mt-1 text-sm text-muted">
                            {quantity(line.quantity)}{" "}
                            {line.presentationName || line.baseUnit} ={" "}
                            <span className="font-medium text-brand">
                              {quantity(line.baseQuantity, line.baseUnit)}
                            </span>
                          </p>
                        </div>
                        <strong className="ml-auto shrink-0 text-sm text-brand tabular-nums">
                          {money(line.landedTotal)}
                        </strong>
                      </div>
                      <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted sm:pl-[52px]">
                        <span>
                          Lote:{" "}
                          <span className="text-brand">
                            {line.lotCode || "Sin código"}
                          </span>
                        </span>
                        <span>
                          {line.expiresOn
                            ? `Vence ${date(line.expiresOn)}`
                            : "Sin fecha"}
                        </span>
                        <span>Descuento: {money(line.discount)}</span>
                        <span>Mercadería: {money(line.lineTotal)}</span>
                        <span>
                          Envío asignado: {money(line.shippingAmount)}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                {detail.notes && (
                  <div className="border-t border-line bg-surface/50 px-5 py-4 text-sm sm:px-6">
                    <p className="text-xs font-medium text-muted">Notas</p>
                    <p className="mt-1 break-words text-brand">
                      {detail.notes}
                    </p>
                  </div>
                )}
              </Card>
              <Card className="gap-5 p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-lg font-bold text-brand">Pagos</h3>
                  <span className="rounded-lg bg-surface px-2.5 py-1 text-xs font-medium text-muted">
                    {detail.payments.length} registrado
                    {detail.payments.length === 1 ? "" : "s"}
                  </span>
                </div>
                <p className="-mt-3 text-sm leading-6 text-muted">
                  Registrar un pago deja constancia administrativa; no procesa
                  el cobro ni cambia el stock.
                </p>
                {!!detail.advanceApplications?.length && (
                  <div className="space-y-3 rounded-lg bg-blue-50 p-4 text-sm">
                    <p className="font-semibold">
                      Anticipo aplicado:{" "}
                      {money(detail.advanceAppliedAmount ?? "0.00")}
                    </p>
                    <p className="text-xs text-muted">
                      El dinero ya estaba pagado; esta aplicación no registra
                      otra salida.
                    </p>
                    {detail.advanceApplications.map((a) => (
                      <p key={a.id}>
                        {money(a.amount)} ·{" "}
                        {a.source === "external"
                          ? "Fuera de caja"
                          : "Efectivo del cajón"}{" "}
                        · {a.paymentMethodName} · {date(a.paidOn)}
                        {a.reference ? ` · ${a.reference}` : ""}
                      </p>
                    ))}
                  </div>
                )}
                {detail.payments.length ? (
                  <ul className="divide-y divide-line text-sm">
                    {detail.payments.map((item) => (
                      <li
                        key={item.id}
                        className="flex items-start gap-3 py-4 first:pt-0 last:pb-0"
                      >
                        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                          <CreditCard aria-hidden="true" className="size-4" />
                        </span>
                        <div className="min-w-0">
                          <p className="font-semibold text-brand">
                            {item.paymentMethodName}
                            {item.source && (
                              <span className="block text-xs font-normal text-muted">
                                {item.source === "cash"
                                  ? "Efectivo del cajón"
                                  : "Pagado fuera de caja"}
                              </span>
                            )}
                            <span className="block text-xs font-normal text-muted">
                              {item.target === "shipping"
                                ? detail.shippingSupplierName
                                : detail.supplierName}
                            </span>
                          </p>
                          <p className="mt-1 break-words text-xs text-muted">
                            {date(item.paidOn)} ·{" "}
                            {item.reference || "Sin referencia"}
                          </p>
                        </div>
                        <strong className="ml-auto shrink-0 text-brand tabular-nums">
                          {money(item.amount)}
                        </strong>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="rounded-xl border border-dashed border-line p-6 text-center text-sm text-muted">
                    <CreditCard
                      aria-hidden="true"
                      className="mx-auto mb-2 size-6 text-muted/60"
                    />
                    Sin pagos registrados.
                  </div>
                )}
              </Card>
            </div>
            <aside className="space-y-4 xl:sticky xl:top-24">
              <Card className="gap-5 p-5 sm:p-6">
                <h3 className="text-lg font-bold text-brand">
                  Resumen de la recepción
                </h3>
                <PaymentStatus receipt={detail} />
                <dl className="divide-y divide-line text-sm">
                  <div className="flex items-center justify-between gap-4 pb-4">
                    <dt className="text-muted">Costo final de la recepción</dt>
                    <dd className="text-xl font-bold text-brand tabular-nums">
                      {money(detail.landedAmount)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 py-4">
                    <dt className="text-muted">Pagado al proveedor</dt>
                    <dd className="font-semibold text-brand tabular-nums">
                      {money(detail.paidAmount)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 pt-4">
                    <dt className="font-semibold text-brand">
                      Saldo con {detail.supplierName}
                    </dt>
                    <dd className="font-bold text-brand tabular-nums">
                      {money(detail.balanceDue)}
                    </dd>
                  </div>
                </dl>
                {Number(detail.shippingAmount) > 0 && (
                  <div className="space-y-2 rounded-lg bg-surface p-4 text-sm">
                    <p>
                      Mercadería:{" "}
                      <strong>{money(detail.merchandiseAmount)}</strong>
                    </p>
                    <p>
                      Envío: <strong>{money(detail.shippingAmount)}</strong>
                    </p>
                    <p>Cobra el envío: {detail.shippingSupplierName}</p>
                    <p>
                      Reparto:{" "}
                      {detail.shippingAllocation === "manual"
                        ? "Manual"
                        : "Por valor de mercadería"}
                    </p>
                    {detail.shippingSupplierId !== detail.supplierId ? (
                      <>
                        <p>
                          Pagado al transportista:{" "}
                          {money(detail.shippingPaidAmount)}
                        </p>
                        <p>
                          Saldo del transportista:{" "}
                          <strong>{money(detail.shippingBalanceDue)}</strong>
                        </p>
                      </>
                    ) : (
                      <p>El envío está incluido en el saldo del proveedor.</p>
                    )}
                  </div>
                )}
                {detail.totalAmount === null ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-800">
                    El costo está pendiente. Los pagos se habilitarán cuando una
                    futura corrección auditada complete el total.
                  </p>
                ) : detail.balanceDue !== null &&
                  (Number(detail.balanceDue) > 0 ||
                    Number(detail.shippingBalanceDue) > 0) &&
                  !payment ? (
                  <Button
                    type="button"
                    className="w-full"
                    onClick={() => {
                      setPaymentTarget(
                        Number(detail.balanceDue) > 0 ? "supplier" : "shipping",
                      );
                      setPayment(true);
                    }}
                  >
                    <Plus aria-hidden="true" /> Registrar pago
                  </Button>
                ) : null}
              </Card>
              {payment && (
                <Card className="gap-4 p-5 sm:p-6">
                  <div>
                    <h3 className="text-lg font-bold text-brand">
                      Registrar pago
                    </h3>
                    <p className="mt-1 text-xs leading-5 text-muted">
                      Podés registrar el pago total o una parte del saldo.
                    </p>
                  </div>
                  <form className="space-y-5" onSubmit={confirmPayment}>
                    <fieldset
                      className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1"
                      disabled={paymentOperation.locked}
                    >
                      <label className="text-sm font-medium">
                        <FieldCaption required>Pago a</FieldCaption>
                        <select
                          required
                          className="form-control mt-2"
                          value={paymentTarget}
                          onChange={(e) => {
                            setPaymentTarget(
                              e.target.value as "supplier" | "shipping",
                            );
                            setAmount("");
                          }}
                        >
                          <option value="supplier">
                            {detail.supplierName} · saldo{" "}
                            {money(detail.balanceDue)}
                          </option>
                          {detail.shippingSupplierId &&
                            detail.shippingSupplierId !== detail.supplierId && (
                              <option value="shipping">
                                {detail.shippingSupplierName} · saldo{" "}
                                {money(detail.shippingBalanceDue)}
                              </option>
                            )}
                        </select>
                      </label>
                      <SearchSelect
                        entity="payment-methods"
                        label="Medio de pago"
                        value={paymentMethodId}
                        onChange={setPaymentMethodId}
                        filter={
                          paymentSource === "cash"
                            ? (r) => r.kind === "cash"
                            : undefined
                        }
                        required
                      />
                      <label className="space-y-2 text-sm font-medium">
                        <FieldCaption required>Origen del dinero</FieldCaption>
                        <select
                          required
                          className="form-control"
                          value={paymentSource}
                          onChange={(e) => {
                            setPaymentSource(
                              e.target.value as "cash" | "external",
                            );
                            setPaymentMethodId("");
                          }}
                        >
                          <option value="external">Fuera de caja</option>
                          <option value="cash">Efectivo del cajón</option>
                        </select>
                      </label>
                      <Field
                        label="Fecha de pago"
                        type="date"
                        value={paidOn}
                        onChange={setPaidOn}
                        required
                      />
                      <Field
                        label="Importe pagado"
                        inputMode="decimal"
                        unit="ARS"
                        value={amount}
                        onChange={setAmount}
                        placeholder="0,00"
                        required
                      />
                      <Field
                        label="Referencia"
                        value={reference}
                        onChange={setReference}
                        placeholder="Opcional"
                      />
                    </fieldset>
                    <div className="flex flex-col gap-2">
                      {paymentOperation.uncertain ? (
                        <Button
                          type="button"
                          className="h-auto min-h-11 whitespace-normal"
                          disabled={paymentOperation.busy}
                          onClick={paymentOperation.retry}
                        >
                          Reintentar desde este formulario
                        </Button>
                      ) : (
                        <Button
                          type="submit"
                          disabled={paymentOperation.locked}
                        >
                          Confirmar pago
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        disabled={paymentOperation.locked}
                        onClick={() => setPayment(false)}
                      >
                        Cancelar
                      </Button>
                    </div>
                  </form>
                </Card>
              )}
            </aside>
          </div>
        </div>
      )}
    </div>
  );
}
