"use client";

import { paths } from "@/lib/navigation";
import { ProductConfigurator } from "./product-configurator";
import type { PublicConfiguration } from "@/modules/recipes/configuration";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Store, Armchair, Bike, Plus, RotateCw, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  role,
  initialAccount,
  initialTable,
}: {
  actorId: string;
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
  const success = useCallback((result: unknown) => {
    const sale = result as SaleDetail;
    window.history.replaceState(null, "", `/sales?account=${sale.id}`);
    setDetail(sale);
    setView("detail");
    setLines([]);
    setPaymentOpen(false);
    setCancelOpen(false);
    setNotice("Operación guardada. Los importes quedaron registrados.");
    setError("");
    setRefresh((n) => n + 1);
  }, []);
  const operation = useOperation<Record<string, unknown>>(
    actorId,
    "sale",
    success,
  );
  const locked = operation.locked || loading;
  useEffect(() => {
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
  }, [refresh]);
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
    config: PublicConfiguration;
    index?: number;
  } | null>(null);
  async function configure(row: SaleLookup["rows"][number], index?: number) {
    if (locked) return;
    setLoading(true);
    setError("");
    try {
      const config = await getJson<PublicConfiguration>(
        `/api/sales/products/${row.id}/configuration?channel=${channel}`,
      );
      if (config.model === "configurable")
        setConfiguring({ row, config, index });
      else if (index === undefined) add(row);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  function add(row: SaleLookup["rows"][number]) {
    if (locked) return;
    setLines((current) => {
      const present = current.find((l) => l.productId === row.id);
      if (present)
        return current.map((l) =>
          l.productId === row.id
            ? { ...l, quantity: Math.min(999, l.quantity + 1) }
            : l,
        );
      return current.length < 50 ? [...current, newCartLine(row)] : current;
    });
    setNotice("");
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
        expectedFulfillmentVersionId,
        modifiers,
      }) => ({
        expectedRecipeVersionId,
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
    setLoading(true);
    setError("");
    try {
      const updated = await Promise.all(
        lines.map(async (line) => {
          if (line.expectedRecipeVersionId && line.modifiers)
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
    <div className="space-y-5">
      <Dialog
        open={!!configuring}
        onOpenChange={(open) => {
          if (!open) setConfiguring(null);
        }}
      >
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{configuring?.row.name}</DialogTitle>
            <DialogDescription>
              Elegí las opciones de este producto.
            </DialogDescription>
          </DialogHeader>
          {configuring && (
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
                    price: inputDecimal(data.expectedPrice),
                    priceReason: "",
                  };
                  return index === undefined
                    ? [...current, item]
                    : current.map((l, i) => (i === index ? item : l));
                });
                setConfiguring(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <div className="page-heading">
        <div>
          <h1 className="page-title">Punto de venta</h1>
          <p className="page-description">
            Cada pedido, cada cobro, en un solo lugar.
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button asChild variant="outline">
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
      <div className="flex gap-6 border-b border-line">
        <button
          disabled={locked}
          onClick={() => {
            if (view !== "new") newSale();
          }}
          className={`min-h-11 border-b-2 px-1 text-sm font-bold ${showCart ? "border-orange-500 text-brand" : "border-transparent text-muted"}`}
        >
          Nueva venta
        </button>
        <button
          disabled={locked || lines.length > 0}
          onClick={() => {
            setView("history");
            setNotice("");
          }}
          className={`min-h-11 border-b-2 px-1 text-sm font-bold ${view === "history" ? "border-orange-500 text-brand" : "border-transparent text-muted"}`}
        >
          Historial
        </button>
      </div>
      <SalesScope />
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
      {notice && (
        <p
          role="status"
          className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800"
        >
          {notice}
        </p>
      )}
      {showCart && (
        <>
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
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
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
              ).map(({ value, label, hint, icon: Icon }) => (
                <button
                  key={value}
                  disabled={locked || lines.length > 0}
                  onClick={() => changeOrigin(value)}
                  aria-label={label}
                  aria-pressed={origin === value}
                  className={`flex min-h-20 flex-col items-center justify-center gap-2 rounded-xl border p-3 text-center sm:flex-row sm:justify-start sm:gap-3 sm:p-4 sm:text-left ${origin === value ? "border-orange-300 bg-orange-50/70" : "border-line bg-white hover:border-slate-300"} disabled:cursor-default`}
                >
                  <span
                    className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${origin === value ? "bg-orange-100 text-orange-700" : "bg-surface text-muted"}`}
                  >
                    <Icon size={21} />
                  </span>
                  <span>
                    <span className="block text-xs font-extrabold text-brand sm:text-sm">
                      {label}
                    </span>
                    <span className="mt-1 hidden text-[11px] text-muted sm:block">
                      {hint}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          )}
          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_370px]">
            <div className="min-w-0 space-y-5">
              {!isAppend && (
                <section className="surface-panel grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
                  <LookupSelect
                    kind="customers"
                    label="Cliente"
                    value={customerId}
                    disabled={locked}
                    onChange={setCustomerId}
                    empty="Consumidor ocasional"
                  />
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
                      <Control label="Modalidad">
                        <select
                          className={selectClass}
                          value={fulfillment}
                          disabled={locked}
                          onChange={(e) => {
                            setFulfillment(e.target.value);
                            setTableId("");
                          }}
                        >
                          <option value="takeaway">Para llevar</option>
                          <option value="dine_in">Consumir en el local</option>
                        </select>
                      </Control>
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
                channel={channel}
                locked={locked || lines.length >= 50}
                onAdd={configure}
                refresh={refresh}
              />
            </div>
            <div className="min-w-0 space-y-3 xl:sticky xl:top-20">
              <Cart
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
                <div className="mb-4">
                  <Control label="Observaciones del pedido">
                    <Input
                      value={notes}
                      disabled={locked}
                      maxLength={500}
                      placeholder="Aclaraciones para el pedido"
                      onChange={(e) => setNotes(e.target.value)}
                    />
                  </Control>
                </div>
                {isAppend ? (
                  <Button
                    className="w-full"
                    disabled={locked || !valid}
                    onClick={() => submit()}
                  >
                    Guardar pedido
                  </Button>
                ) : origin === "table" ? (
                  <Button
                    className="w-full"
                    disabled={locked || !valid}
                    onClick={() => submit()}
                  >
                    Abrir cuenta
                  </Button>
                ) : (
                  <div className="space-y-2">
                    <Button
                      className="w-full"
                      disabled={locked || !valid}
                      onClick={() => {
                        if (total && integer(total) === 0n) submit();
                        else {
                          operation.clearError();
                          setPaymentOpen(true);
                        }
                      }}
                    >
                      {total === "0.00"
                        ? "Registrar sin cargo"
                        : origin === "delivery"
                          ? "Registrar con cobro"
                          : "Cobrar y registrar"}
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
                    onClick={() => {
                      setLines([]);
                      operation.clearError();
                    }}
                  >
                    Vaciar pedido
                  </Button>
                </div>
              )}
            </div>
          </div>
        </>
      )}
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
