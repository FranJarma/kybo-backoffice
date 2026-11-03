"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PrintJobView, PrintingSnapshot } from "@/modules/printing/types";
import { currentPrintingBranch, usePrinting } from "./use-printing";

export const kindLabels: Record<string, string> = {
  original: "Original",
  copy: "Copia",
  historical: "Histórico",
  cancellation: "Anulación",
  change: "Cambio",
  test: "Prueba",
};
export const printStateLabels: Record<string, string> = {
  pending: "Pendiente",
  leased: "En cola",
  sending: "Enviando",
  sent: "Enviado a Windows",
  error: "Error",
  uncertain: "Resultado incierto",
  review: "Requiere revisión",
  cancelled: "Cancelado",
};
export function ConfirmQueueRemoval({
  job,
  busy,
  onManage,
}: {
  job: PrintJobView;
  busy: boolean;
  onManage: (command: Record<string, unknown>) => void;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      disabled={busy}
      onClick={() => {
        if (
          window.confirm(
            "Primero retiralo o cancelalo en la cola de Windows. ¿Confirmás que este trabajo ya no está pendiente allí? Kybo no lo elimina de Windows.",
          )
        )
          onManage({
            action: "resolve",
            jobId: job.id,
            result: "discard",
            queueCleared: true,
          });
      }}
    >
      {job.state === "cancelled"
        ? "Confirmar retiro de cola"
        : "Descartar envío"}
    </Button>
  );
}
export function OrderPrintingView({
  data,
  onReprint,
  onManage,
  busy = false,
}: {
  data: PrintingSnapshot;
  onReprint: (job: PrintJobView) => void;
  onManage?: (command: Record<string, unknown>) => void;
  busy?: boolean;
}) {
  if (!data.ready)
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        Impresión con activación pendiente. {data.message}
      </section>
    );
  return (
    <section
      className="rounded-xl border border-line bg-white p-4"
      aria-label="Impresión de comandas"
    >
      <h3 className="font-bold text-brand">Comandas impresas</h3>
      {!data.settings?.enabled && (
        <p className="mt-2 text-sm text-muted">
          La impresión está desactivada.
        </p>
      )}
      {data.jobs.length === 0 && (
        <p className="mt-2 text-sm text-muted">
          No hay comandas de impresión para esta venta.
        </p>
      )}
      <div className="mt-2 divide-y divide-line">
        {data.jobs.map((job) => (
          <article key={job.id} className="py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <strong className="text-sm text-brand">
                  {job.stationName} · Pedido {job.saleNumber}.{job.sequence}
                </strong>
                <p className="text-xs text-muted">
                  {printStateLabels[job.state] ?? job.state}
                  {" · "}
                  {kindLabels[job.kind] ?? job.kind}
                  {job.kind === "copy" ? ` ${job.copyNumber}` : ""}
                </p>
              </div>
              {job.canReprint && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onReprint(job)}
                >
                  Reimprimir
                </Button>
              )}
            </div>
            {data.canManage && onManage && (
              <div className="mt-2 flex flex-wrap gap-2">
                {job.canRetry && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => onManage({ action: "retry", jobId: job.id })}
                  >
                    Reintentar
                  </Button>
                )}
                {(job.state === "uncertain" || job.state === "review") && (
                  <>
                    <p className="w-full text-xs text-muted">
                      Revisá la cola de Windows antes de resolver este trabajo.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        if (
                          window.confirm(
                            "¿Confirmás que el ticket salió en papel y que el trabajo ya no está en la cola de Windows?",
                          )
                        )
                          onManage({
                            action: "resolve",
                            jobId: job.id,
                            result: "printed",
                          });
                      }}
                    >
                      Marcar impreso
                    </Button>
                    <ConfirmQueueRemoval
                      job={job}
                      busy={busy}
                      onManage={onManage}
                    />
                  </>
                )}
                {job.state === "cancelled" && job.spoolState !== "removed" && (
                  <ConfirmQueueRemoval
                    job={job}
                    busy={busy}
                    onManage={onManage}
                  />
                )}
              </div>
            )}
            {!job.canReprint && (
              <p className="mt-2 text-xs text-muted">
                La copia no está disponible. Revisá el estado y la cola de
                Windows antes de continuar.
              </p>
            )}
            {job.error && (
              <p className="mt-2 text-sm text-red-700">
                {job.error} La venta sigue confirmada.
              </p>
            )}
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer font-semibold text-brand">
                Ver ticket
              </summary>
              <div className="mt-2 whitespace-pre-wrap break-words rounded-lg bg-slate-50 p-3 font-mono text-xs">
                {job.document.lines.map((line, i) => (
                  <div
                    key={i}
                    className={`${line.style === "bold" || line.style === "title" || line.style === "heading" ? "font-bold" : ""} ${line.align === "center" ? "text-center" : ""}`}
                  >
                    {line.text || "\u00a0"}
                  </div>
                ))}
              </div>
            </details>
          </article>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted">
        Enviado indica que Windows aceptó el trabajo; no confirma la salida en
        papel.
      </p>
    </section>
  );
}
const reasons = [
  "No salió el ticket",
  "Ticket perdido",
  "Ticket ilegible",
  "Otro motivo",
];
export function ReprintForm({
  job,
  busy,
  onSubmit,
}: {
  job: PrintJobView;
  busy: boolean;
  onSubmit: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [other, setOther] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const value = reason === "Otro motivo" ? other.trim() : reason;
        if (value) onSubmit(value);
      }}
      className="space-y-4"
    >
      <fieldset>
        <legend className="text-sm font-semibold">
          Motivo de la copia <span aria-hidden="true">*</span>
        </legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {reasons.map((r) => (
            <label
              key={r}
              className="flex min-h-11 items-center gap-2 rounded-lg border border-line p-3 text-sm"
            >
              <input
                type="radio"
                name="reason"
                value={r}
                required
                checked={reason === r}
                onChange={() => setReason(r)}
              />
              {r}
            </label>
          ))}
        </div>
      </fieldset>
      {reason === "Otro motivo" && (
        <label className="block text-sm font-semibold">
          Detalle del motivo
          <input
            required
            maxLength={300}
            value={other}
            onChange={(e) => setOther(e.target.value)}
            className="mt-2 min-h-11 w-full rounded-lg border border-line px-3"
          />
        </label>
      )}
      <p className="rounded-lg bg-slate-50 p-3 text-sm">
        Se enviará una copia solo para <strong>{job.stationName}</strong>,
        pedido {job.saleNumber}.{job.sequence}.
      </p>
      <Button
        type="submit"
        disabled={
          busy || !reason || (reason === "Otro motivo" && !other.trim())
        }
      >
        Enviar copia
      </Button>
    </form>
  );
}
export function OrderPrinting({
  saleId,
  actorId,
}: {
  saleId: string;
  actorId: string;
}) {
  const [branchId] = useState(currentPrintingBranch);
  const { data, error, busy, uncertain, retry, send } = usePrinting(
    branchId,
    actorId,
    saleId,
  );
  const [selected, setSelected] = useState<PrintJobView | null>(null);
  return (
    <>
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-800"
        >
          {error} La venta sigue confirmada. Podés volver a intentar la misma
          operación.
        </p>
      )}
      {uncertain && !selected && (
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() => void retry()}
        >
          Reintentar la misma operación
        </Button>
      )}
      {data && (
        <OrderPrintingView
          data={data}
          onReprint={setSelected}
          busy={busy || uncertain}
          onManage={(command) => void send(command)}
        />
      )}
      <Dialog
        open={!!selected}
        onOpenChange={(open) => {
          if (!open && !busy && !uncertain) setSelected(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reimprimir comanda</DialogTitle>
            <DialogDescription>
              Indicá por qué necesitás una copia.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-red-700">
              {error} La venta sigue confirmada. Podés volver a intentar.
            </p>
          )}
          {uncertain && (
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() =>
                void retry().then((result) => {
                  if (result) setSelected(null);
                })
              }
            >
              Reintentar la misma operación
            </Button>
          )}
          {selected && !uncertain && (
            <ReprintForm
              key={selected.id}
              job={selected}
              busy={busy}
              onSubmit={(reason) => {
                void send({
                  action: "reprint",
                  jobId: selected.id,
                  reason,
                }).then((result) => {
                  if (result) setSelected(null);
                });
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function LatestOrderPrintingView({
  data,
  error,
  onOpen,
}: {
  data?: PrintingSnapshot;
  error?: string;
  onOpen: () => void;
}) {
  const failed =
    error ||
    (data &&
      (!data.ready ||
        data.jobs.some((j) =>
          ["error", "uncertain", "review"].includes(j.state),
        )));
  const pending = data?.jobs.some((j) =>
    ["pending", "leased", "sending"].includes(j.state),
  );
  const unrouted = data?.jobs.some(
    (j) => j.stationName === "REVISAR ESTACIÓN" && j.state !== "cancelled",
  );
  if (!failed && !pending && !unrouted) return null;
  return (
    <div
      role="status"
      className={`flex flex-wrap items-center gap-2 rounded-lg px-3 py-2 text-sm ${failed ? "bg-amber-50 text-amber-950" : "bg-slate-50 text-muted"}`}
    >
      <span>
        {unrouted
          ? "Hay productos sin estación asignada. Revisá el ticket y avisá a Barra o Cocina."
          : failed
            ? "La impresión necesita revisión. La venta sigue confirmada."
            : "Pendiente de impresión."}
      </span>
      <button
        type="button"
        className="font-semibold underline"
        onClick={onOpen}
      >
        Ver tickets
      </button>
    </div>
  );
}
export function LatestOrderPrinting({
  branchId,
  actorId,
  saleId,
  onOpen,
}: {
  branchId: string;
  actorId: string;
  saleId: string;
  onOpen: () => void;
}) {
  const { data, error } = usePrinting(branchId, actorId, saleId, 3000);
  return <LatestOrderPrintingView data={data} error={error} onOpen={onOpen} />;
}
