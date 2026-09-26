"use client";
import {
  Clock3,
  Check,
  ArrowUpRight,
  Play,
  UserRound,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  prepLabels,
  type PrepTask,
  type PrepStatus,
} from "@/modules/preparation/types";
import { originLabels, channelLabels } from "@/modules/sales/types";
export function duration(seconds: number | null) {
  if (seconds === null) return "—";
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")} min`;
}
export const tones: Record<PrepStatus, string> = {
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  preparing: "bg-blue-50 text-blue-800 border-blue-200",
  ready: "bg-emerald-50 text-emerald-800 border-emerald-200",
  delivered: "bg-slate-100 text-slate-600 border-slate-200",
  cancelled: "bg-rose-50 text-rose-800 border-rose-200",
};
export function PrepCard({
  task: t,
  actorId,
  locked,
  now,
  onAct,
  onDetail,
}: {
  task: PrepTask;
  actorId: string;
  locked: boolean;
  now: number;
  onAct: (t: PrepTask, action: string) => void;
  onDetail: (id: string) => void;
}) {
  const count = t.lines.reduce((s, l) => s + l.quantity, 0),
    isMine = t.assigneeId === actorId;
  const complete = t.siblings.every((s) =>
    ["ready", "delivered"].includes(s.status),
  );
  const liveStart =
    t.status === "pending"
      ? t.enqueuedAt
      : t.status === "preparing"
        ? t.startedAt
        : t.status === "ready"
          ? t.readyAt
          : null;
  const clock = liveStart
    ? duration((now - Date.parse(liveStart)) / 1000)
    : duration(t.timing.totalSeconds);
  return (
    <article
      data-testid={`prep-task-${t.id}`}
      className="min-w-0 overflow-hidden rounded-xl border border-line bg-white shadow-[0_2px_8px_#0b234208]"
    >
      <div
        className={cn(
          "h-1",
          t.status === "pending"
            ? "bg-amber-400"
            : t.status === "preparing"
              ? "bg-blue"
              : "bg-emerald-500",
        )}
      />
      <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
              {t.origin === "delivery"
                ? channelLabels[t.channel]
                : originLabels[t.origin]}
              {t.tableName ? ` · ${t.tableName}` : ""}
            </p>
            <h3 className="mt-1 text-xl font-extrabold tracking-tight text-brand">
              #{t.saleNumber}
              <span className="text-sm font-medium text-muted">
                {" "}
                / {t.sequence}
              </span>
            </h3>
          </div>
          <span
            className={cn(
              "flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs font-bold tabular-nums",
              tones[t.status],
            )}
            title={
              t.status === "pending"
                ? "Tiempo esperando inicio"
                : t.status === "preparing"
                  ? "Tiempo en preparación"
                  : t.status === "ready"
                    ? "Tiempo esperando entrega"
                    : "Tiempo total"
            }
          >
            <Clock3 size={13} />
            {clock}
          </span>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px]">
          <span className="rounded-md bg-surface px-2 py-1 font-bold text-brand">
            {t.stationName}
          </span>
          <span className="text-muted">
            {count} {count === 1 ? "producto" : "productos"}
          </span>
          <span className="ml-auto text-muted">
            {t.fulfillment === "dine_in"
              ? "En el local"
              : t.fulfillment === "delivery"
                ? "Envío"
                : "Para retirar"}
          </span>
        </div>
        {t.externalId && (
          <p className="mt-2 break-words text-xs text-muted">
            Pedido externo {t.externalId}
          </p>
        )}
        <ul className="my-4 space-y-3 border-y border-line py-4">
          {t.lines.map((l) => (
            <li key={l.id} className="flex items-start gap-2.5">
              <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-md bg-surface px-1 text-xs font-extrabold">
                {l.quantity}
              </span>
              <div className="min-w-0">
                <p className="break-words text-sm font-bold leading-6 text-brand">
                  {l.name}
                </p>
                {l.notes && (
                  <p className="mt-0.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-muted">
                    {l.notes}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
        {t.notes && (
          <p className="mb-3 whitespace-pre-wrap break-words rounded-lg bg-amber-50/70 p-2.5 text-xs leading-relaxed text-amber-950">
            {t.notes}
          </p>
        )}
        <div className="flex items-center gap-1.5 text-xs text-muted">
          <UserRound size={13} />
          <span className="truncate">
            {t.assigneeName
              ? `${t.assigneeName}${isMine ? " · vos" : ""}`
              : "Sin asignar"}
          </span>
        </div>
        {t.siblings.length > 1 && (
          <p
            className={cn(
              "mt-3 text-[11px] font-semibold",
              complete ? "text-emerald-700" : "text-muted",
            )}
          >
            {complete
              ? "Pedido completo listo"
              : `${t.siblings.filter((s) => ["ready", "delivered"].includes(s.status)).length} de ${t.siblings.length} estaciones listas`}
          </p>
        )}
        {t.saleCancelled && (
          <p className="mt-2 text-xs font-bold text-rose-700">Venta anulada</p>
        )}
        <div className="mt-4 flex items-center gap-2">
          {t.status === "pending" && (
            <Button
              className="min-h-11 flex-1"
              disabled={locked}
              onClick={() => onAct(t, "start")}
            >
              <Play size={15} />
              Empezar
            </Button>
          )}
          {t.status === "preparing" && (
            <Button
              className="min-h-11 flex-1"
              disabled={locked || !isMine}
              onClick={() => onAct(t, "ready")}
            >
              <Check size={16} />
              {isMine ? "Marcar listo" : "Preparando"}
            </Button>
          )}
          {t.status === "ready" && (
            <Button
              className="min-h-11 flex-1 bg-brand text-white hover:bg-brand-dark"
              disabled={locked}
              onClick={() => onAct(t, "deliver")}
            >
              <ArrowUpRight size={17} />
              Entregar
            </Button>
          )}
          {["delivered", "cancelled"].includes(t.status) && (
            <span
              className={cn(
                "rounded-md border px-2 py-1 text-xs font-bold",
                tones[t.status],
              )}
            >
              {prepLabels[t.status]}
            </span>
          )}
          <Button
            className="min-h-11 shrink-0"
            variant="outline"
            size="icon"
            aria-label="Ver detalle"
            onClick={() => onDetail(t.id)}
          >
            <MoreHorizontal size={18} />
          </Button>
        </div>
      </div>
    </article>
  );
}
