"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Radio, Monitor, ArrowUpRight } from "lucide-react";
import { getJson, useOperation } from "@/components/inventory/shared";
import { Button } from "@/components/ui/button";
import { OperationAlert } from "@/components/ui/operation-alert";
import { OperationNotice } from "@/components/sales/shared";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import type { LocatorHistory } from "@/modules/pickup/types";
import { useLocators } from "./use-locators";
import { LocatorGrid } from "./locator-grid";

export function LocatorManager({
  actorId,
  orderId,
  label,
  cancelled = false,
  onChanged,
  onOpenSale,
  disabled = false,
}: {
  actorId: string;
  orderId?: string;
  label?: string;
  cancelled?: boolean;
  onChanged?: () => void;
  onOpenSale?: (saleId: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="min-h-12"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Radio size={17} aria-hidden="true" />
        {orderId ? "Localizador e historial" : "Localizadores"}
      </Button>
      {open && (
        <LocatorManagementDialog
          actorId={actorId}
          orderId={orderId}
          label={label}
          cancelled={cancelled}
          onChanged={onChanged}
          onOpenSale={onOpenSale}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
export function PickupActions({
  actorId,
  onChanged,
  onOpenSale,
}: {
  actorId: string;
  onChanged: () => void;
  onOpenSale?: (saleId: string) => void;
}) {
  const { fleet, error } = useLocators(0);
  return (
    <div
      className="flex flex-wrap items-center gap-2"
      aria-label="Retiro de pedidos"
    >
      <LocatorManager
        actorId={actorId}
        onChanged={onChanged}
        onOpenSale={onOpenSale}
      />
      {fleet && !error ? (
        <Button asChild variant="secondary" className="min-h-12">
          <a href={fleet.publicPath} target="_blank" rel="noreferrer">
            <Monitor size={17} aria-hidden="true" />
            Pantalla de clientes
            <ArrowUpRight size={16} aria-hidden="true" />
            <span className="sr-only"> (abre en otra pestaña)</span>
          </a>
        </Button>
      ) : (
        <Button variant="secondary" className="min-h-12" disabled>
          <Monitor size={17} aria-hidden="true" />
          Pantalla de clientes
        </Button>
      )}
      {error && (
        <p role="status" className="w-full text-xs text-muted">
          No se pudo cargar el enlace de la pantalla. Reintentando…
        </p>
      )}
    </div>
  );
}

function LocatorManagementDialog({
  actorId,
  orderId,
  label,
  cancelled,
  onClose,
  onChanged,
  onOpenSale,
}: {
  actorId: string;
  orderId?: string;
  label?: string;
  cancelled: boolean;
  onClose: () => void;
  onChanged?: () => void;
  onOpenSale?: (saleId: string) => void;
}) {
  const [version, setVersion] = useState(0);
  const { fleet, error } = useLocators(version);
  const [selected, setSelected] = useState<{
    orderId: string;
    label: string;
    cancelled: boolean;
  } | null>(orderId ? { orderId, label: label ?? "", cancelled } : null);
  const [history, setHistory] = useState<LocatorHistory[]>();
  const [historyError, setHistoryError] = useState("");
  const [number, setNumber] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [notice, setNotice] = useState("");
  const success = useCallback(
    (result: unknown) => {
      setVersion((v) => v + 1);
      setSelected(null);
      setHistory(undefined);
      setConfirmed(false);
      setNotice(
        (result as LocatorHistory[]).every((a) => a.returnedAt)
          ? "Localizador devuelto. Ya está disponible."
          : "Asignación actualizada. El historial quedó guardado.",
      );
      onChanged?.();
    },
    [onChanged],
  );
  const operation = useOperation<Record<string, unknown>>(
    actorId,
    "pickup",
    success,
  );
  useEffect(() => {
    if (!selected) return;
    let live = true;
    getJson<LocatorHistory[]>(`/api/pickup/orders/${selected.orderId}`)
      .then((rows) => {
        if (live) {
          setHistory(rows);
          setNumber(rows.find((a) => !a.returnedAt)?.number ?? null);
          setHistoryError("");
        }
      })
      .catch(() => {
        if (live)
          setHistoryError(
            "No se pudo consultar el historial. Cerrá y volvé a abrir el pedido.",
          );
      });
    return () => {
      live = false;
    };
  }, [selected]);
  const current = history?.find((a) => !a.returnedAt);
  return (
    <Dialog
      open
      onOpenChange={(value) => {
        if (!value && !operation.locked) onClose();
      }}
    >
      <DialogContent
        data-pickup-controls
        className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"
      >
        <DialogHeader>
          <DialogTitle>
            {selected ? `Pedido ${selected.label}` : "Localizadores"}
          </DialogTitle>
          <DialogDescription>
            {selected
              ? "Podés cambiar el equipo o consultar su historial. Se libera al entregar el pedido completo."
              : "Se liberan al entregar el pedido completo. Usá «Devolver» para registrar una devolución puntual."}
          </DialogDescription>
        </DialogHeader>
        <OperationNotice
          error={operation.error}
          eventKey={operation.errorAttempt}
          uncertain={operation.uncertain}
          busy={operation.busy}
          retry={operation.retry}
        />
        <OperationAlert title="Localizadores" message={notice} />
        {(error || historyError) && (
          <p role="alert" className="text-sm text-red-700">
            {error || historyError}
          </p>
        )}
        {selected ? (
          <>
            <p className="font-bold">
              {current
                ? `Localizador actual: ${current.number}`
                : "Sin localizador asignado"}
            </p>
            <LocatorGrid
              fleet={fleet}
              value={number}
              onChange={setNumber}
              currentId={current?.id}
              disabled={
                operation.locked || !history || !!error || selected.cancelled
              }
            />
            {selected.cancelled && current && (
              <Button
                variant="outline"
                className="min-h-12"
                onClick={() => setNumber(null)}
                disabled={operation.locked}
              >
                Devolver localizador {current.number}
              </Button>
            )}
            {current && (
              <label className="flex min-h-14 items-center gap-3 rounded-lg border border-line p-3 text-sm">
                <input
                  type="checkbox"
                  className="size-6"
                  checked={confirmed}
                  disabled={operation.locked}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Recibí físicamente el localizador {current.number}
              </label>
            )}
            <Button
              className="min-h-12"
              disabled={
                operation.locked ||
                !history ||
                !!error ||
                !!historyError ||
                (current?.number ?? null) === number ||
                (!!current && !confirmed)
              }
              onClick={() =>
                operation.submit(`/api/pickup/orders/${selected.orderId}`, {
                  requestId: crypto.randomUUID(),
                  expectedAssignmentId: current?.id ?? null,
                  number,
                  returnConfirmed: confirmed,
                })
              }
            >
              {number === null
                ? "Confirmar devolución"
                : `Asignar localizador ${number}`}
            </Button>
            <details className="border-t border-line pt-3">
              <summary className="min-h-12 cursor-pointer font-semibold">
                Historial de asignaciones
              </summary>
              {history?.length === 0 && <p>Este pedido no tuvo localizador.</p>}
              {history?.map((a) => (
                <div key={a.id} className="border-b border-line py-3 text-sm">
                  <strong>Localizador {a.number}</strong>
                  <p>
                    Asignado por {a.assignedBy} ·{" "}
                    {new Date(a.assignedAt).toLocaleString("es-AR")}
                  </p>
                  <p>
                    {a.returnedAt
                      ? `Devuelto a ${a.returnedBy} · ${new Date(a.returnedAt).toLocaleString("es-AR")}`
                      : "Pendiente de devolución"}
                  </p>
                </div>
              ))}
            </details>
            <Button
              variant="ghost"
              className="min-h-12"
              disabled={operation.locked}
              onClick={() => setSelected(null)}
            >
              Ver todos los localizadores
            </Button>
          </>
        ) : (
          <>
            {fleet && (
              <a
                href={fleet.publicPath}
                target="_blank"
                rel="noreferrer"
                className="flex min-h-12 items-center justify-center rounded-lg bg-brand px-4 font-bold text-white"
              >
                Abrir pantalla de clientes ↗
              </a>
            )}
            <p className="text-sm text-muted">
              {fleet
                ? `${fleet.count - fleet.occupied.length} de ${fleet.count} disponibles`
                : "Consultando equipos…"}
            </p>
            {fleet?.occupied.length === 0 && (
              <p>No hay equipos pendientes de devolución.</p>
            )}
            {fleet?.occupied.map((a) => (
              <div
                key={a.id}
                className="flex items-center justify-between gap-3 border-b border-line py-3"
              >
                <div>
                  <strong className="text-xl">Localizador {a.number}</strong>
                  <p className="text-sm">
                    Pedido {a.label}
                    {a.cancelled ? " · Anulado" : ""}
                  </p>
                  <Link
                    href={`/sales?account=${a.saleId}`}
                    className="inline-flex min-h-12 items-center text-sm underline"
                    aria-disabled={operation.locked || undefined}
                    tabIndex={operation.locked ? -1 : undefined}
                    onClick={(event) => {
                      if (operation.locked) {
                        event.preventDefault();
                        return;
                      }
                      if (
                        onOpenSale &&
                        !event.metaKey &&
                        !event.ctrlKey &&
                        !event.shiftKey &&
                        !event.altKey
                      ) {
                        event.preventDefault();
                        onClose();
                        onOpenSale(a.saleId);
                      }
                    }}
                  >
                    Ver venta
                  </Link>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-12"
                  aria-label={`Devolver localizador ${a.number}`}
                  disabled={operation.locked || !!error}
                  onClick={() =>
                    operation.submit(`/api/pickup/orders/${a.orderId}`, {
                      requestId: crypto.randomUUID(),
                      expectedAssignmentId: a.id,
                      number: null,
                      returnConfirmed: true,
                    })
                  }
                >
                  Devolver
                </Button>
              </div>
            ))}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
