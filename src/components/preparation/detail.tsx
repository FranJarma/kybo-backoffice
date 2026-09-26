"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getJson } from "@/components/inventory/shared";
import { Control, selectClass } from "@/components/sales/shared";
import { prepLabels, type PrepTask } from "@/modules/preparation/types";
import { duration } from "./card";
import { usePreparationDetail } from "./use-feed";
const eventNames: Record<string, string> = {
  queued: "Ingresó a preparación",
  start: "Empezó la preparación",
  ready: "Marcó listo",
  deliver: "Registró la entrega",
  reassign: "Transfirió la tarea",
  cancel: "Canceló por anulación de venta",
};
const time = (s: string) =>
  new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Salta",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(s));
export function PrepDetailDialog({
  id,
  manager,
  refresh,
  locked: boardLocked,
  onClose,
  onTransfer,
  operationNotice,
}: {
  id: string;
  manager: boolean;
  refresh: number;
  locked: boolean;
  onClose: () => void;
  onTransfer: (t: PrepTask, assigneeId: string, reason: string) => void;
  operationNotice: React.ReactNode;
}) {
  const detail = usePreparationDetail(id, refresh);
  const data = detail.data,
    locked = boardLocked || !detail.fresh;
  const [error, setError] = useState(""),
    [people, setPeople] = useState<{ id: string; name: string }[]>([]),
    [person, setPerson] = useState(""),
    [reason, setReason] = useState("");
  useEffect(() => {
    let live = true;
    if (manager)
      getJson<{ id: string; name: string }[]>("/api/preparation/people")
        .then((r) => {
          if (live) setPeople(r);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [manager]);
  return (
    <Dialog
      open
      onOpenChange={(v) => {
        if (!v) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Detalle de comanda
            {data ? ` #${data.task.saleNumber} / ${data.task.sequence}` : ""}
          </DialogTitle>
          <DialogDescription>
            {data
              ? `${data.task.stationName} · ${prepLabels[data.task.status]}`
              : "Consultando estado…"}
          </DialogDescription>
        </DialogHeader>
        {(detail.error || error) && (
          <p role="alert" className="text-sm text-rose-700">
            {detail.error || error}
          </p>
        )}
        <p role="status" className="text-xs text-muted">
          {detail.fresh
            ? "Detalle actualizado"
            : "Estado sin confirmar. Actualizando el detalle…"}
        </p>
        {operationNotice}
        {data && (
          <>
            <div className="grid grid-cols-3 gap-2 rounded-xl bg-surface p-4 text-center">
              {(
                [
                  ["Espera", data.task.timing.waitSeconds],
                  ["Preparación", data.task.timing.prepSeconds],
                  ["Hasta entrega", data.task.timing.handoffSeconds],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <p className="text-[11px] text-muted">{label}</p>
                  <p className="mt-1 text-sm font-extrabold tabular-nums text-brand">
                    {duration(value)}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-muted">
              Tiempos de esta estación. Un guion indica una etapa sin completar.
              Las transferencias conservan el inicio original.
            </p>
            <ul className="space-y-3">
              {data.task.lines.map((l) => (
                <li key={l.id} className="break-words text-sm">
                  <strong>
                    {l.quantity} × {l.name}
                  </strong>
                  {l.notes && (
                    <p className="mt-1 whitespace-pre-wrap text-xs text-muted">
                      {l.notes}
                    </p>
                  )}
                </li>
              ))}
            </ul>
            <div className="rounded-xl border border-line p-4">
              <h3 className="mb-3 text-sm font-bold">
                Estaciones de este pedido
              </h3>
              <ul className="space-y-2">
                {data.task.siblings.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-start justify-between gap-3 text-xs"
                  >
                    <span className="break-words">{s.stationName}</span>
                    <span className="shrink-0 font-semibold text-muted">
                      {prepLabels[s.status]}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="mb-3 text-sm font-bold">Actividad</h3>
              <ol className="space-y-4 border-l border-line pl-4">
                {data.events.map((e) => (
                  <li key={e.id} className="relative text-xs">
                    <span className="absolute -left-[21px] top-1 h-2 w-2 rounded-full bg-blue" />
                    <p className="font-bold text-brand">
                      {eventNames[e.action]}
                    </p>
                    <p className="mt-1 text-muted">
                      {e.actorName} · {time(e.createdAt)}
                    </p>
                    {e.assigneeId && e.action === "reassign" && (
                      <p className="mt-1 text-muted">
                        Nuevo responsable:{" "}
                        {people.find((p) => p.id === e.assigneeId)?.name ??
                          (data.task.assigneeId === e.assigneeId
                            ? data.task.assigneeName
                            : "Usuario registrado")}
                      </p>
                    )}
                    {e.reason && (
                      <p className="mt-1 whitespace-pre-wrap break-words text-muted">
                        {e.reason}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
            </div>
            {manager && data.task.status === "preparing" && (
              <form
                className="space-y-3 rounded-xl bg-surface p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (
                    !locked &&
                    person &&
                    person !== data.task.assigneeId &&
                    reason.trim()
                  )
                    onTransfer(data.task, person, reason);
                }}
              >
                <h3 className="text-sm font-bold">Transferir preparación</h3>
                <Control label="Nuevo responsable">
                  <select
                    required
                    className={selectClass}
                    value={person}
                    disabled={locked}
                    onChange={(e) => setPerson(e.target.value)}
                  >
                    <option value="">Elegir persona</option>
                    {people
                      .filter((p) => p.id !== data.task.assigneeId)
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                  </select>
                </Control>
                <Control label="Motivo de transferencia">
                  <Input
                    required
                    maxLength={500}
                    value={reason}
                    disabled={locked}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </Control>
                <Button
                  disabled={
                    locked ||
                    !person ||
                    person === data.task.assigneeId ||
                    !reason.trim()
                  }
                >
                  Confirmar transferencia
                </Button>
              </form>
            )}
            <div className="flex justify-between gap-3 border-t border-line pt-4">
              <Link
                href={`/sales?account=${data.task.saleId}`}
                className="self-center text-xs font-bold text-blue"
              >
                Ver venta
              </Link>
              <Button variant="outline" onClick={onClose}>
                Cerrar
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
