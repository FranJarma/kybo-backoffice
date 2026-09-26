"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ReceiptText } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { getJson, money, today } from "@/components/inventory/shared";
import {
  type SaleList,
  type SaleSummary,
  originLabels,
  channelLabels,
  statusLabels,
} from "@/modules/sales/types";
import { Control, selectClass } from "./shared";
export function SaleHistory({
  onSelect,
  locked,
}: {
  onSelect: (sale: SaleSummary) => void;
  locked: boolean;
}) {
  const [date, setDate] = useState(today()),
    [origin, setOrigin] = useState(""),
    [status, setStatus] = useState(""),
    [q, setQ] = useState(""),
    [offset, setOffset] = useState(0),
    [data, setData] = useState<SaleList>({ rows: [], total: 0, offset: 0 }),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      setLoading(true);
      setError("");
      getJson<SaleList>(
        `/api/sales?${new URLSearchParams({ date, origin, status, q, offset: String(offset) })}`,
      )
        .then((r) => {
          if (live) setData(r);
        })
        .catch((e) => {
          if (live) setError(e.message);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 150);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [date, origin, status, q, offset]);
  return (
    <section className="surface-panel p-4 sm:p-6">
      <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Control label="Fecha comercial">
          <Input
            type="date"
            value={date}
            onChange={(e) => {
              setDate(e.target.value);
              setOffset(0);
            }}
          />
        </Control>
        <Control label="Origen">
          <select
            className={selectClass}
            value={origin}
            onChange={(e) => {
              setOrigin(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">Todos los orígenes</option>
            <option value="counter">Mostrador</option>
            <option value="table">Mesa</option>
            <option value="delivery">Delivery</option>
          </select>
        </Control>
        <Control label="Estado">
          <select
            className={selectClass}
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setOffset(0);
            }}
          >
            <option value="">Todos los estados</option>
            <option value="open">Pendiente de cobro</option>
            <option value="closed">Cobrada</option>
            <option value="cancelled">Anulada</option>
          </select>
        </Control>
        <Control label="Buscar venta">
          <Input
            value={q}
            placeholder="Nº de venta, cliente o pedido…"
            onChange={(e) => {
              setQ(e.target.value);
              setOffset(0);
            }}
          />
        </Control>
      </div>
      {error ? (
        <p role="alert" className="py-10 text-sm text-red-700">
          {error}
        </p>
      ) : loading ? (
        <p role="status" className="py-12 text-center text-sm text-muted">
          Cargando ventas…
        </p>
      ) : data.rows.length === 0 ? (
        <div className="py-14 text-center">
          <ReceiptText size={30} className="mx-auto mb-3 text-muted" />
          <h2 className="font-bold text-brand">
            No hay ventas para estos filtros
          </h2>
          <p className="mt-2 text-sm text-muted">
            Las ventas confirmadas van a aparecer acá.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-line">
          {data.rows.map((sale) => (
            <button
              key={sale.id}
              disabled={locked}
              onClick={() => onSelect(sale)}
              className="flex w-full items-start justify-between gap-4 py-5 text-left hover:bg-surface/50"
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-bold text-brand">
                    #{sale.number} ·{" "}
                    {sale.tableName ?? originLabels[sale.origin]}
                  </span>
                  <span
                    className={`rounded-full px-2 py-1 text-[10px] font-bold ${sale.status === "closed" ? "bg-emerald-50 text-emerald-800" : sale.status === "open" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-muted"}`}
                  >
                    {statusLabels[sale.status]}
                  </span>
                </div>
                <p className="mt-2 truncate text-xs text-muted">
                  {sale.customerName ?? "Consumidor ocasional"} ·{" "}
                  {channelLabels[sale.channel]} · {sale.orderCount}{" "}
                  {sale.orderCount === 1 ? "pedido" : "pedidos"}
                </p>
                <p className="mt-1 text-xs text-muted">
                  {new Intl.DateTimeFormat("es-AR", {
                    dateStyle: "short",
                    timeStyle: "short",
                    timeZone: "America/Argentina/Salta",
                  }).format(new Date(sale.createdAt))}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-extrabold tabular-nums text-brand">
                  {money(sale.totalAmount)}
                </p>
                {sale.status === "open" && (
                  <p className="mt-2 text-xs text-amber-800">
                    Saldo {money(sale.balanceDue)}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
      <div className="mt-4 flex items-center justify-between gap-3 border-t border-line pt-4">
        <p className="text-xs text-muted">
          {data.total} {data.total === 1 ? "venta" : "ventas"} · cada cuenta de
          mesa cuenta una vez
        </p>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="icon"
            aria-label="Ventas anteriores"
            disabled={offset === 0 || loading}
            onClick={() => setOffset(Math.max(0, offset - 30))}
          >
            <ChevronLeft size={16} />
          </Button>
          <Button
            variant="outline"
            size="icon"
            aria-label="Ventas siguientes"
            disabled={offset + 30 >= data.total || loading}
            onClick={() => setOffset(offset + 30)}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>
    </section>
  );
}
