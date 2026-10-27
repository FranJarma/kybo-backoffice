"use client";
import { useRef, useState } from "react";
import { OperationPanel } from "@/components/ui/operation-panel";
import { ArrowRight } from "lucide-react";
import { PurchaseCalculation } from "@/components/inventory/purchase-calculation";
import {
  taskAction,
  taskDueDate,
} from "@/modules/daily-operations/presentation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { quantity } from "@/lib/number-format";
import type { TaskRow } from "@/modules/daily-operations/types";
import { stateLabels, urgencyLabels } from "./task-list";
export function TaskDetail({
  task,
  people,
  canManage,
  disabled,
  onClose,
  onRefresh,
  timeZone = "America/Argentina/Buenos_Aires",
}: {
  task: TaskRow;
  people: { id: string; name: string }[];
  canManage: boolean;
  disabled: boolean;
  onClose: () => void;
  onRefresh: (reconcile?: boolean) => Promise<TaskRow | undefined>;
  timeZone?: string;
}) {
  const [current, setCurrent] = useState(task),
    [assignee, setAssignee] = useState(task.assignedTo ?? ""),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [stale, setStale] = useState(false),
    [uncertain, setUncertain] = useState(false);
  const pending = useRef<Record<string, unknown> | null>(null);
  const closed = ["done", "cancelled", "superseded"].includes(current.state);
  async function reload() {
    setBusy(true);
    try {
      const fresh = await onRefresh(true);
      if (fresh) {
        setCurrent(fresh);
        setStale(false);
        setError("");
      } else {
        setStale(true);
        setError(
          "Esta tarea ya no está en la vista actual. Cerrá el detalle y consultá el historial.",
        );
      }
    } catch {
      setError("No pudimos actualizar la tarea.");
    } finally {
      setBusy(false);
    }
  }
  async function send(action: string, retry = false) {
    setBusy(true);
    setError("");
    const body = retry
      ? pending.current
      : {
          requestId: crypto.randomUUID(),
          expectedRevision: current.revision,
          action,
          ...(action === "assign" ? { assignedTo: assignee } : {}),
          ...(["cancel", "report_blocked"].includes(action) ? { reason } : {}),
        };
    pending.current = body;
    try {
      const response = await fetch(`/api/operations/tasks/${current.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) {
        setError(result.error ?? "No pudimos realizar la operación.");
        setStale(response.status === 409);
        setUncertain(response.status >= 500);
        if (response.status < 500) pending.current = null;
        return;
      }
      pending.current = null;
      setUncertain(false);
      try {
        await onRefresh();
      } finally {
        onClose();
      }
    } catch {
      if (!pending.current) return;
      setUncertain(true);
      setError(
        "No pudimos confirmar el resultado. Reintentá la misma operación para evitar duplicados.",
      );
    } finally {
      setBusy(false);
    }
  }
  const locked = busy || disabled || stale || closed || uncertain;
  const action = taskAction(current),
    linkLocked =
      busy || disabled || stale || uncertain || (closed && !current.documentId);
  const forecast = current.purchaseAlert;
  return (
    <OperationPanel
      title={forecast?.itemName ?? current.title}
      label={
        current.kind === "purchase"
          ? "Tarea de compra"
          : current.kind === "transfer"
            ? "Tarea de reposición"
            : "Operación del día"
      }
      description={`${urgencyLabels[current.urgency]} · ${stateLabels[current.state]}`}
      locked={busy || uncertain}
      onClose={onClose}
      footer={
        <>
          <Button
            variant="outline"
            className="min-h-12"
            onClick={onClose}
            disabled={busy || uncertain}
          >
            Cerrar
          </Button>
          {action && (canManage || current.kind === "production") && (
            <a
              href={action.href}
              aria-disabled={linkLocked}
              tabIndex={linkLocked ? -1 : 0}
              onClick={(e) => {
                if (linkLocked) e.preventDefault();
              }}
              className={`inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold ${current.kind === "purchase" ? "bg-primary text-primary-foreground" : "border border-line text-brand"} ${linkLocked ? "pointer-events-none opacity-50" : ""}`}
            >
              {action.label}
              <ArrowRight className="size-4" />
            </a>
          )}
        </>
      }
    >
      {current.quantity && (
        <section className="flex flex-wrap items-start justify-between gap-4 border-b border-line pb-6">
          <div>
            <p className="text-sm text-muted-foreground">
              {current.kind === "purchase"
                ? "Cantidad sugerida para pedir"
                : "Cantidad de la tarea"}
            </p>
            <p className="mt-2 text-4xl font-bold tracking-tight text-brand">
              {quantity(current.quantity)}{" "}
              <span className="text-base font-normal tracking-normal">
                {current.unit === "unit" ? "unidades" : current.unit}
              </span>
            </p>
          </div>
          {current.dueAt && (
            <span className="rounded-lg bg-orange-50 px-3 py-2 text-right text-xs font-semibold text-orange-900">
              {taskDueDate(current.dueAt, timeZone)}
            </span>
          )}
        </section>
      )}
      {!current.quantity && current.dueAt && (
        <p className="text-sm font-semibold text-orange-900">
          {taskDueDate(current.dueAt, timeZone)}
        </p>
      )}
      {(current.originName || current.locationName) && (
        <p className="text-sm font-semibold text-brand">
          {current.originName ? `${current.originName} → ` : ""}
          {current.locationName}
        </p>
      )}
      {forecast && (
        <>
          <dl className="grid grid-cols-3 gap-3 text-brand">
            {[
              [
                "Disponible",
                quantity(forecast.availableQuantity, forecast.baseUnit),
              ],
              [
                "Ya pedido",
                quantity(forecast.incomingQuantity, forecast.baseUnit),
              ],
              [
                "Alcanza para",
                forecast.coverageDays === null
                  ? "Sin estimar"
                  : `${forecast.coverageAtLeast ? "≥ " : ""}${quantity(forecast.coverageDays)} días`,
              ],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-muted-foreground">{label}</dt>
                <dd className="mt-2 text-base font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {forecast.status === "needs_estimate" ? (
              "Estimá el consumo diario en la ficha del insumo para saber cuándo y cuánto comprar."
            ) : (
              <>
                Este insumo demora{" "}
                <strong className="font-semibold text-brand">
                  {forecast.leadDays} días en llegar
                </strong>
                . Se consideran {forecast.safetyDays} días extra de margen para
                anticipar demoras.
              </>
            )}
          </p>
          <PurchaseCalculation alert={forecast} />
        </>
      )}
      {current.assigneeUnavailable && (
        <p
          role="alert"
          className="rounded-lg border border-orange-200 p-3 text-sm"
        >
          El responsable ya no está habilitado. Asigná otra persona antes de
          ejecutar.
        </p>
      )}
      {!!current.materials?.length && (
        <section className="rounded-lg border p-4">
          <h3 className="mb-2 font-semibold">Insumos a trasladar</h3>
          <ul className="space-y-2 text-sm">
            {current.materials.map((m) => (
              <li key={m.itemId} className="flex justify-between gap-4">
                <span>{m.name}</span>
                <span className="shrink-0 font-semibold">
                  {quantity(m.quantity, m.unit)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {!forecast && (
        <details className="border-y border-line py-3">
          <summary className="min-h-8 cursor-pointer text-sm font-semibold text-blue-700">
            Ver motivo y detalle
          </summary>
          <p className="mt-3 rounded-lg bg-slate-50 p-4 text-sm leading-relaxed text-brand">
            {current.reason || "Tarea vinculada a un documento de operación."}
          </p>
        </details>
      )}
      {error && (
        <div
          role="alert"
          className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm"
        >
          {error}
        </div>
      )}
      {uncertain && (
        <Button
          className="min-h-14"
          disabled={busy}
          onClick={() => send("", true)}
        >
          Reintentar la misma operación
        </Button>
      )}
      {stale && (
        <Button
          variant="outline"
          className="min-h-12"
          disabled={busy}
          onClick={reload}
        >
          Actualizar tarea conservando lo escrito
        </Button>
      )}
      {!closed && (
        <div className="space-y-5">
          {canManage && (
            <div className="space-y-2">
              <label htmlFor="daily-assignee" className="text-sm font-medium">
                Responsable
              </label>
              <div className="flex flex-wrap gap-2">
                <select
                  id="daily-assignee"
                  className="min-h-12 min-w-0 flex-1 rounded-lg border bg-white px-3"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  disabled={locked}
                >
                  <option value="">Elegí una persona</option>
                  {people.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <Button
                  variant="outline"
                  className="min-h-12"
                  disabled={locked || !assignee}
                  onClick={() => send("assign")}
                >
                  Asignar
                </Button>
              </div>
            </div>
          )}
          {canManage &&
            !current.documentId &&
            current.kind === "production" && (
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Asigná un responsable y confirmá la preparación en Depósito.
                  Cuando se registre como terminada, aparecerá la reposición a
                  Barra o Cocina.
                </p>
                <Button
                  className="min-h-14 w-full"
                  disabled={
                    locked || !current.assignedTo || !current.locationId
                  }
                  onClick={() => send("confirm_production")}
                >
                  Confirmar preparación en Depósito
                </Button>
              </div>
            )}
          {current.documentId &&
            current.kind === "production" &&
            current.state !== "in_progress" && (
              <Button
                className="min-h-14 w-full"
                disabled={locked || !current.assignedTo}
                onClick={() => send("start")}
              >
                Comenzar preparación
              </Button>
            )}
          {current.documentId && current.kind === "transfer" && (
            <>
              <p className="text-sm text-muted-foreground">
                Confirmá cuando los insumos estén en destino. El traslado
                interno descuenta origen y suma destino en una sola operación.
              </p>
              <Button
                className="min-h-14 w-full"
                disabled={locked || !current.assignedTo}
                onClick={() => send("dispatch")}
              >
                Confirmar traslado realizado
              </Button>
            </>
          )}
          {canManage && !current.documentId && current.kind === "transfer" && (
            <Button
              className="min-h-14 w-full"
              disabled={locked}
              onClick={() => send("confirm_transfer")}
            >
              Confirmar reposición sugerida
            </Button>
          )}
          {!current.documentId && current.kind !== "purchase" && (
            <p className="text-sm text-muted-foreground">
              Es una sugerencia. El encargado debe confirmar la orden
              correspondiente antes de ejecutarla.
            </p>
          )}
          <details className="border-y border-line py-3">
            <summary className="min-h-8 cursor-pointer text-sm font-medium text-muted-foreground">
              Informar un impedimento
            </summary>
            <div className="mt-3 space-y-3">
              <label className="grid gap-2 text-sm font-medium">
                Motivo o impedimento
                <Input
                  className="min-h-12"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Por ejemplo: falta mercadería en Depósito"
                  disabled={busy || uncertain}
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  className="min-h-12"
                  disabled={locked || !reason.trim()}
                  onClick={() => send("report_blocked")}
                >
                  Informar bloqueo
                </Button>
                {canManage &&
                  !(current.kind === "purchase" && current.documentId) && (
                    <Button
                      variant="outline"
                      className="min-h-12"
                      disabled={locked || !reason.trim()}
                      onClick={() => send("cancel")}
                    >
                      Cancelar tarea
                    </Button>
                  )}
              </div>
            </div>
          </details>
        </div>
      )}
    </OperationPanel>
  );
}
