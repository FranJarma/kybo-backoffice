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
import { taskDueDate } from "@/modules/daily-operations/presentation";
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
export function TaskList({
  tasks,
  onSelect,
  timeZone = "America/Argentina/Buenos_Aires",
}: {
  tasks: TaskRow[];
  onSelect: (task: TaskRow) => void;
  timeZone?: string;
}) {
  return (
    <div className="divide-y rounded-xl border bg-white">
      {tasks.map((t) => {
        const Icon =
          t.kind === "production"
            ? ChefHat
            : t.kind === "transfer"
              ? Truck
              : t.kind === "purchase"
                ? ShoppingCart
                : ClipboardCheck;
        return (
          <button
            key={t.id}
            onClick={() => onSelect(t)}
            className="flex min-h-24 w-full items-start gap-3 p-4 text-left transition-colors hover:bg-orange-50/40 focus-visible:outline-2 focus-visible:outline-primary sm:gap-4 sm:p-5"
          >
            <span
              className={`mt-1 hidden rounded-lg p-3 sm:block ${t.kind === "purchase" ? "bg-orange-50 text-orange-700" : "bg-blue-50 text-blue-700"}`}
            >
              <Icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1 space-y-2">
              <span className="flex flex-wrap items-center gap-2 text-xs">
                <span
                  className={`rounded-md border px-2 py-1 font-semibold ${urgencyColors[t.urgency]}`}
                >
                  {urgencyLabels[t.urgency]}
                </span>
                <span className="text-muted-foreground">
                  {stateLabels[t.state]}
                </span>
                {t.dueAt && new Date(t.dueAt) < new Date() && (
                  <span className="font-semibold text-red-700">Vencida</span>
                )}
              </span>
              <span className="block break-words text-base font-semibold text-brand">
                {t.purchaseAlert?.itemName ?? t.title}
              </span>
              <span className="block text-sm text-muted-foreground">
                {t.kind === "purchase" && t.quantity ? "Comprar " : ""}
                {t.quantity ? quantity(t.quantity, t.unit ?? undefined) : ""}
                {t.quantity &&
                (t.originName ||
                  t.locationName ||
                  t.purchaseAlert?.coverageDays)
                  ? " · "
                  : ""}
                {t.originName ? `${t.originName} → ` : ""}
                {t.locationName ??
                  (t.purchaseAlert?.coverageDays
                    ? `Stock para ${quantity(t.purchaseAlert.coverageDays)} días`
                    : "")}
              </span>
              <span className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <span
                  className={
                    t.assignedTo ? "text-brand" : "font-medium text-orange-800"
                  }
                >
                  {t.assigneeUnavailable
                    ? "Reasignar responsable"
                    : (t.assignedToName ?? "Sin responsable")}
                </span>
                {t.dueAt && (
                  <span className="text-muted-foreground">
                    {taskDueDate(t.dueAt, timeZone)}
                  </span>
                )}
              </span>
            </span>
            <ArrowRight className="mt-5 size-5 shrink-0 text-muted-foreground" />
          </button>
        );
      })}
    </div>
  );
}
