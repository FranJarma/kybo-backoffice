"use client";
import {
  ArrowRight,
  ChefHat,
  Truck,
  ShoppingCart,
  ClipboardCheck,
} from "lucide-react";
import type { TaskRow, Urgency } from "@/modules/daily-operations/types";
import { quantity } from "@/lib/number-format";
import {
  taskDateLabel,
  taskIsClosed,
  taskNextStep,
} from "@/modules/daily-operations/presentation";
export const urgencyLabels: Record<Urgency, string> = {
  critical: "Crítica",
  high: "Alta",
  scheduled: "Programada",
};
export const urgencyColors: Record<Urgency, string> = {
  critical: "bg-red-50 text-red-800 border-red-200",
  high: "bg-orange-50 text-orange-900 border-orange-200",
  scheduled: "bg-blue-50 text-blue-900 border-blue-200",
};
export const stateLabels = {
  pending: "Pendiente",
  in_progress: "En curso",
  blocked: "Bloqueada",
  awaiting_review: "Revisión pendiente",
  done: "Terminada",
  cancelled: "Cancelada",
  superseded: "Necesidad cubierta",
};
const kindLabels = {
  production: "Preparación",
  transfer: "Reposición",
  purchase: "Compra",
  count: "Control",
};
export function TaskList({
  tasks,
  onSelect,
  timeZone = "America/Argentina/Buenos_Aires",
  disabled = false,
  canManage = true,
}: {
  tasks: TaskRow[];
  onSelect: (task: TaskRow) => void;
  timeZone?: string;
  disabled?: boolean;
  canManage?: boolean;
}) {
  return (
    <div className="@container overflow-hidden rounded-xl border border-line bg-white">
      <div
        aria-hidden="true"
        className="hidden gap-5 border-b border-line bg-surface px-4 py-3 text-xs font-semibold text-muted @min-[680px]:grid @min-[680px]:grid-cols-[minmax(0,1fr)_150px_190px] @min-[900px]:grid-cols-[minmax(0,1fr)_180px_230px]"
      >
        <span>Tarea y ubicación</span>
        <span>Responsable</span>
        <span>Estado y próximo paso</span>
      </div>
      <ul className="divide-y divide-line">
        {tasks.map((task) => {
          const Icon =
            task.kind === "production"
              ? ChefHat
              : task.kind === "transfer"
                ? Truck
                : task.kind === "purchase"
                  ? ShoppingCart
                  : ClipboardCheck;
          const closed = taskIsClosed(task);
          return (
            <li key={task.id}>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onSelect(task)}
                className="grid min-h-12 w-full grid-cols-2 gap-x-4 gap-y-3 p-4 text-left transition-colors hover:bg-blue-soft/40 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-blue disabled:cursor-wait disabled:opacity-60 @min-[680px]:grid-cols-[minmax(0,1fr)_150px_190px] @min-[900px]:grid-cols-[minmax(0,1fr)_180px_230px]"
              >
                <span className="col-span-2 flex min-w-0 items-start gap-3 @min-[680px]:col-span-1">
                  <Icon
                    aria-hidden="true"
                    className="mt-1 size-5 shrink-0 text-muted"
                  />
                  <span className="min-w-0 space-y-1.5">
                    <span className="block break-words text-base font-bold leading-snug text-brand">
                      {task.purchaseAlert?.itemName ?? task.title}
                    </span>
                    <span className="block text-sm font-medium text-brand">
                      {kindLabels[task.kind]}
                      {task.quantity
                        ? ` · ${quantity(task.quantity, task.unit ?? undefined)}`
                        : ""}
                    </span>
                    {(task.originName || task.locationName) && (
                      <span className="block break-words text-sm text-muted">
                        {task.originName ? `${task.originName} → ` : ""}
                        {task.locationName}
                      </span>
                    )}
                    {task.kind === "purchase" &&
                      task.purchaseAlert?.coverageDays && (
                        <span className="block text-sm text-muted">
                          Stock para {quantity(task.purchaseAlert.coverageDays)}{" "}
                          días
                        </span>
                      )}
                  </span>
                </span>
                <span className="min-w-0 pl-8 text-sm @min-[680px]:pl-0">
                  <span className="mb-1 block text-xs text-muted @min-[680px]:hidden">
                    Responsable
                  </span>
                  <span
                    className={`block break-words font-semibold ${task.assignedTo ? "text-brand" : "text-amber-800"}`}
                  >
                    {task.assigneeUnavailable
                      ? "Reasignar responsable"
                      : (task.assignedToName ?? "Sin responsable")}
                  </span>
                  {task.dueAt && (
                    <span className="mt-1 block text-xs text-muted">
                      {taskDateLabel(task, timeZone)}
                    </span>
                  )}
                </span>
                <span className="min-w-0 space-y-2">
                  <span className="flex flex-wrap items-center gap-2 text-xs">
                    {!closed && (
                      <span
                        className={`rounded border px-2 py-1 font-semibold ${urgencyColors[task.urgency]}`}
                      >
                        {urgencyLabels[task.urgency]}
                      </span>
                    )}
                    <span
                      className={`font-semibold ${task.state === "blocked" ? "text-amber-900" : task.state === "done" ? "text-emerald-800" : "text-muted"}`}
                    >
                      {stateLabels[task.state]}
                    </span>
                    {!closed &&
                      task.dueAt &&
                      new Date(task.dueAt) < new Date() && (
                        <span className="font-semibold text-red-800">
                          Vencida
                        </span>
                      )}
                  </span>
                  <span className="flex items-start justify-between gap-2 text-sm font-semibold text-blue">
                    <span>{taskNextStep(task, canManage)}</span>
                    <ArrowRight
                      aria-hidden="true"
                      className="mt-0.5 size-4 shrink-0"
                    />
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
