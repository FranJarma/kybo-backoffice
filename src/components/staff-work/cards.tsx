"use client";

import { Check, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { quantity } from "@/components/inventory/shared";
import { ProductionDifferenceForm } from "@/components/production/difference-form";
import { PreparationModifiers } from "@/components/preparation/modifiers";
import type {
  StaffPreparationTask,
  StaffProductionOrder,
} from "@/modules/staff-work/types";

export function PreparationWorkCard({
  task,
  locked,
  onAct,
}: {
  task: StaffPreparationTask;
  locked: boolean;
  onAct: (task: StaffPreparationTask, action: "start" | "ready") => void;
}) {
  return (
    <article className="overflow-hidden rounded-xl border border-line bg-white">
      <div
        className={`h-1 ${task.status === "ready" ? "bg-emerald-500" : task.status === "preparing" ? "bg-blue" : "bg-amber-400"}`}
      />
      <div className="space-y-4 p-4">
        <header className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold text-muted">
              {task.stationName}
              {task.tableName ? ` · ${task.tableName}` : ""}
            </p>
            <h3 className="mt-1 text-xl font-extrabold tracking-tight text-brand">
              Pedido #{task.saleNumber}
              <span className="text-sm font-medium text-muted">
                {" "}
                / {task.sequence}
              </span>
            </h3>
          </div>
          {task.locatorNumber != null && (
            <span className="rounded-lg bg-brand px-3 py-2 text-center text-xs font-semibold text-white">
              Localizador
              <strong className="block text-lg">{task.locatorNumber}</strong>
            </span>
          )}
        </header>
        <ul className="space-y-3 border-y border-line py-4">
          {task.lines.map((line) => (
            <li key={line.id} className="flex gap-3">
              <span className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded-md bg-surface px-1 text-sm font-bold">
                {line.quantity}
              </span>
              <div className="min-w-0">
                <p className="font-semibold text-brand">{line.name}</p>
                <PreparationModifiers
                  modifiers={line.modifiers}
                  quantity={line.quantity}
                />
                {line.notes && (
                  <p className="mt-1 whitespace-pre-wrap text-sm text-muted">
                    {line.notes}
                  </p>
                )}
              </div>
            </li>
          ))}
        </ul>
        {task.notes && (
          <p className="whitespace-pre-wrap rounded-lg bg-amber-50 p-3 text-sm text-amber-950">
            {task.notes}
          </p>
        )}
        {task.status === "preparing" && !task.canReady && (
          <p className="text-sm text-muted">
            Preparando: {task.assigneeName ?? "Otra persona"}
          </p>
        )}
        {task.status === "ready" && (
          <p
            role="status"
            className="flex items-center gap-2 text-sm font-semibold text-emerald-700"
          >
            <Check size={17} />
            {task.orderReady ? "Listo para entregar" : "Tu parte está lista"}
          </p>
        )}
        {task.status === "ready" && !task.orderReady && (
          <p className="text-xs text-muted">Falta completar otra estación.</p>
        )}
        {task.canStart && (
          <Button
            className="min-h-12 w-full"
            disabled={locked}
            data-action="start"
            onClick={() => onAct(task, "start")}
          >
            <Play size={16} />
            Comenzar
          </Button>
        )}
        {task.canReady && (
          <Button
            className="min-h-12 w-full"
            disabled={locked}
            data-action="ready"
            onClick={() => onAct(task, "ready")}
          >
            <Check size={17} />
            Marcar listo
          </Button>
        )}
      </div>
    </article>
  );
}

export function ProductionWorkCard({
  order,
  locked,
  timeZone,
  onAct,
  onReport,
}: {
  order: StaffProductionOrder;
  locked: boolean;
  timeZone: string;
  onAct: (order: StaffProductionOrder, action: "start" | "finish") => void;
  onReport: (
    order: StaffProductionOrder,
    report: {
      expectedRevision: number;
      actualQuantity: string;
      reason: string;
    },
  ) => void;
}) {
  return (
    <article className="space-y-4 rounded-xl border border-line bg-white p-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-muted">
            {order.locationName}
          </p>
          <h3 className="mt-1 text-lg font-bold text-brand">{order.name}</h3>
        </div>
        <span
          className={`rounded-md px-2 py-1 text-xs font-semibold ${order.state === "confirmed" && !order.difference ? "bg-blue-50 text-blue" : "bg-amber-50 text-amber-800"}`}
        >
          {order.difference
            ? "Revisión pendiente"
            : order.state === "confirmed"
              ? "En curso"
              : "Pendiente"}
        </span>
      </header>
      <p className="text-xl font-bold text-brand">
        {order.difference ? "Previsto: " : ""}
        {quantity(order.plannedQuantity, order.baseUnit)}
      </p>
      {order.scheduledFor && (
        <p className="text-sm text-muted">
          Para el{" "}
          {new Intl.DateTimeFormat("es-AR", {
            timeZone,
            dateStyle: "short",
            timeStyle: "short",
          }).format(new Date(order.scheduledFor))}
        </p>
      )}
      {order.notes && (
        <p className="whitespace-pre-wrap rounded-lg bg-surface p-3 text-sm">
          {order.notes}
        </p>
      )}
      {(order.preparation || order.components.length > 0) && (
        <details className="border-t border-line pt-3 text-sm">
          <summary className="min-h-10 cursor-pointer font-semibold text-brand">
            Ver instrucciones
            {order.preparation?.estimatedMinutes
              ? ` · ${order.preparation.estimatedMinutes} min`
              : ""}
          </summary>
          <ul className="mb-4 space-y-2">
            {order.components.map((component) => (
              <li key={component.itemId}>
                {component.name}:{" "}
                <strong>
                  {quantity(component.quantity, component.baseUnit)}
                </strong>
              </li>
            ))}
          </ul>
          <ol className="list-decimal space-y-2 pl-5">
            {order.preparation?.steps.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          {order.preparation?.observations && (
            <p className="mt-3 whitespace-pre-wrap text-muted">
              {order.preparation.observations}
            </p>
          )}
        </details>
      )}
      {order.difference ? (
        <div
          role="status"
          className="space-y-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-950"
        >
          <p className="font-semibold">Aviso enviado al encargado</p>
          <p>
            Cantidad informada:{" "}
            {quantity(order.difference.actualQuantity, order.baseUnit)}.
          </p>
          <p className="whitespace-pre-wrap">{order.difference.reason}</p>
          <p>
            El stock se actualizará cuando el encargado revise la producción.
          </p>
        </div>
      ) : (
        <>
          <Button
            className="min-h-12 w-full"
            disabled={locked}
            data-action={order.state === "planned" ? "start" : "finish"}
            onClick={() =>
              onAct(order, order.state === "planned" ? "start" : "finish")
            }
          >
            {order.state === "planned" ? (
              <Play size={16} />
            ) : (
              <Check size={17} />
            )}
            {order.state === "planned"
              ? "Comenzar producción"
              : "Terminar según lo previsto"}
          </Button>
          {order.state === "confirmed" && (
            <p className="text-xs leading-relaxed text-muted">
              Confirmás la cantidad y los insumos previstos. Si hubo cambios,
              usá Informar diferencia.
            </p>
          )}
          {order.state === "confirmed" && (
            <ProductionDifferenceForm
              plannedQuantity={order.plannedQuantity}
              baseUnit={order.baseUnit}
              revision={order.revision}
              locked={locked}
              onReport={(report) => onReport(order, report)}
            />
          )}
        </>
      )}
    </article>
  );
}
