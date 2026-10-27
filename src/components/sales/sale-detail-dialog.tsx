"use client";
import type { ReactNode } from "react";
import { CheckCircle2, Plus, WalletCards, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { money } from "@/components/inventory/shared";
import {
  originLabels,
  channelLabels,
  statusLabels,
  type SaleDetail,
} from "@/modules/sales/types";
import { SaleDetailPanel } from "./sale-detail";

export function SaleDetailDialog({
  sale,
  loading,
  error,
  actorId,
  canCancel,
  canAdd = true,
  locked,
  onClose,
  onRetry,
  onPay,
  onAdd,
  onCancel,
  onChanged,
  onBusy,
  restoreFocus,
  feedback,
  onOpenSale,
}: {
  sale: SaleDetail | null;
  loading: boolean;
  error: string;
  actorId: string;
  canCancel: boolean;
  canAdd?: boolean;
  locked: boolean;
  onClose: () => void;
  onRetry: () => void;
  onPay: () => void;
  onAdd: () => void;
  onCancel: () => void;
  onChanged: () => void;
  onBusy: (busy: boolean) => void;
  restoreFocus: () => void;
  feedback?: ReactNode;
  onOpenSale: (saleId: string) => void;
}) {
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !locked) onClose();
      }}
    >
      <DialogContent
        data-sale-detail
        showCloseButton={false}
        className="flex h-[min(900px,calc(100dvh-2rem))] max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-[1100px] flex-col gap-0 overflow-hidden bg-white p-0 sm:max-w-[1100px] max-sm:inset-0 max-sm:h-dvh max-sm:max-h-dvh max-sm:w-full max-sm:max-w-full max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none data-[state=open]:animate-none data-[state=closed]:animate-none"
        onEscapeKeyDown={(event) => {
          if (locked) event.preventDefault();
        }}
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          restoreFocus();
        }}
      >
        <header className="flex shrink-0 items-start justify-between gap-4 border-b border-line px-5 py-5 sm:px-7">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <DialogTitle className="text-2xl font-extrabold tracking-tight text-brand">
                {sale ? `Venta #${sale.number}` : "Detalle de venta"}
              </DialogTitle>
              {sale && (
                <span
                  className={`status-pill ${sale.status === "closed" ? "bg-emerald-50 text-emerald-800" : sale.status === "cancelled" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-800"}`}
                >
                  {sale.status === "closed" && <CheckCircle2 size={14} />}{" "}
                  {statusLabels[sale.status]}
                </span>
              )}
            </div>
            <DialogDescription className="mt-2 text-left text-sm">
              {sale
                ? `${originLabels[sale.origin]}${sale.tableName ? ` · ${sale.tableName}` : ""} · ${sale.channel === "counter" ? (sale.fulfillment === "takeaway" ? "Para llevar" : "En el local") : channelLabels[sale.channel]} · ${new Date(sale.createdAt).toLocaleString("es-AR", { timeZone: "America/Argentina/Salta", dateStyle: "short", timeStyle: "short" })}`
                : "Consultá la venta sin salir del punto de venta."}
            </DialogDescription>
            {sale && (
              <p className="mt-2 text-sm font-semibold text-brand">
                {sale.customerName ?? "Consumidor ocasional"}
                {sale.externalId && (
                  <span className="font-normal text-muted">
                    {" "}
                    · Pedido externo {sale.externalId}
                  </span>
                )}
              </p>
            )}
          </div>
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 min-w-11 shrink-0 p-2"
            aria-label="Cerrar detalle de venta"
            disabled={locked}
            onClick={onClose}
          >
            <X size={21} />
          </Button>
        </header>
        <div
          data-sale-detail-body
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7"
        >
          {feedback}
          {loading ? (
            <p role="status" className="py-16 text-center text-sm text-muted">
              Cargando venta…
            </p>
          ) : error ? (
            <div role="alert" className="space-y-4 py-10 text-center">
              <p>{error}</p>
              <Button type="button" variant="outline" onClick={onRetry}>
                Volver a consultar
              </Button>
            </div>
          ) : sale ? (
            <SaleDetailPanel
              actorId={actorId}
              sale={sale}
              canCancel={canCancel}
              locked={locked}
              onCancel={onCancel}
              onLocatorChanged={onChanged}
              onBusy={onBusy}
              onOpenSale={onOpenSale}
            />
          ) : null}
        </div>
        <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-line bg-white px-5 py-4 sm:px-7">
          <div>
            {sale && (
              <>
                <p className="text-xs text-muted">Total de la venta</p>
                <p className="text-xl font-extrabold tabular-nums text-brand">
                  {money(sale.totalAmount)}
                </p>
              </>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              className="min-h-12"
              disabled={locked}
              onClick={onClose}
            >
              Cerrar
            </Button>
            {sale?.status === "open" && canAdd && sale.origin === "table" && (
              <Button
                type="button"
                variant="outline"
                className="min-h-12"
                disabled={locked}
                onClick={onAdd}
              >
                <Plus size={17} />
                Agregar pedido
              </Button>
            )}
            {sale?.status === "open" && (
              <Button
                type="button"
                className="min-h-12"
                disabled={locked}
                onClick={onPay}
              >
                <WalletCards size={17} />
                Registrar cobro
              </Button>
            )}
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
