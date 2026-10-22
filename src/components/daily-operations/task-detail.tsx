"use client";
import { useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
}: {
  task: TaskRow;
  people: { id: string; name: string }[];
  canManage: boolean;
  disabled: boolean;
  onClose: () => void;
  onRefresh: () => Promise<TaskRow | undefined>;
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
      const fresh = await onRefresh();
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
  const href =
    current.kind === "production"
      ? "/kitchen/production"
      : current.kind === "transfer"
        ? "/inventory/transfers"
        : "/inventory/purchases";
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy && !uncertain) onClose();
      }}
    >
      <DialogContent className="sm:max-w-xl [&>button]:min-h-12 [&>button]:min-w-12">
        <DialogHeader>
          <DialogTitle className="pr-10">{current.title}</DialogTitle>
          <DialogDescription>
            {urgencyLabels[current.urgency]} · {stateLabels[current.state]}
          </DialogDescription>
        </DialogHeader>
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
                    {quantity(m.quantity)} {m.unit}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
        <p className="rounded-lg bg-muted p-4 text-sm leading-relaxed">
          {current.reason || "Tarea vinculada a un documento de operación."}
        </p>
        <p className="text-sm">
          {current.originName ? `${current.originName} → ` : ""}
          {current.locationName ?? "Sucursal"}
        </p>
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
                    className="min-h-12"
                    disabled={locked || !assignee}
                    onClick={() => send("assign")}
                  >
                    Asignar
                  </Button>
                </div>
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
            {canManage &&
              !current.documentId &&
              current.kind === "transfer" && (
                <Button
                  className="min-h-14 w-full"
                  disabled={locked}
                  onClick={() => send("confirm_transfer")}
                >
                  Confirmar reposición sugerida
                </Button>
              )}
            {!current.documentId && (
              <p className="text-sm text-muted-foreground">
                Es una sugerencia. El encargado debe confirmar la orden
                correspondiente antes de ejecutarla.
              </p>
            )}
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
              {canManage && (
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
        )}
        {(canManage || current.kind === "production") && (
          <a
            href={href}
            className="flex min-h-12 items-center justify-center rounded-lg border px-4 text-sm font-semibold text-brand"
          >
            Abrir{" "}
            {current.kind === "production"
              ? "producción"
              : current.kind === "transfer"
                ? "traslados"
                : "recepciones de compras"}
          </a>
        )}
        <Button
          variant="ghost"
          className="min-h-12"
          onClick={onClose}
          disabled={busy || uncertain}
        >
          Cerrar
        </Button>
      </DialogContent>
    </Dialog>
  );
}
