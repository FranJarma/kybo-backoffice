"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OperationAlert } from "@/components/ui/operation-alert";
import { useOperation } from "@/components/inventory/shared";
import type { StaffWorkSnapshot } from "@/modules/staff-work/types";
import { PreparationWorkCard, ProductionWorkCard } from "./cards";

export function PersonalWork({
  branchId,
  actorId,
  initialTab = "tasks",
  showTabControls = true,
}: {
  branchId: string;
  actorId: string;
  initialTab?: "tasks" | "production";
  showTabControls?: boolean;
}) {
  const [tab, setTab] = useState<"preparation" | "production">(
    initialTab === "production" ? "production" : "preparation",
  );
  const [snapshot, setSnapshot] = useState<{
    key: string;
    data: StaffWorkSnapshot;
    receivedAt: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [version, setVersion] = useState(0);
  const [clock, setClock] = useState(0);
  const active = useRef(false);
  const key = `${actorId}:${branchId}`;
  const saved = useCallback(() => {
    active.current = false;
    setNotice("Tarea actualizada.");
    setSnapshot((current) =>
      current ? { ...current, receivedAt: 0 } : current,
    );
    setVersion((value) => value + 1);
  }, []);
  const preparation = useOperation<Record<string, unknown>>(
    actorId,
    "preparation",
    saved,
    branchId,
  );
  const production = useOperation<Record<string, unknown>>(
    actorId,
    "production-order",
    saved,
    branchId,
  );
  useEffect(() => {
    let live = true;
    let controller: AbortController | null = null;
    let poll: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      if (document.hidden) return;
      clearTimeout(poll);
      controller?.abort();
      const own = new AbortController();
      controller = own;
      const timeout = setTimeout(() => own.abort(), 9000);
      try {
        if (!navigator.onLine)
          throw new Error(
            "Sin conexión. Actualizá tus tareas al recuperar internet.",
          );
        const response = await fetch("/api/staff/work", {
          cache: "no-store",
          headers: { "X-Kybo-Branch-Id": branchId },
          signal: own.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(data.error ?? "No pudimos actualizar tus tareas.");
        if (live && controller === own) {
          setSnapshot({ key, data, receivedAt: Date.now() });
          setClock(Date.now());
          setError("");
        }
      } catch (failure) {
        if (live && controller === own) {
          setError(
            failure instanceof Error && failure.name !== "AbortError"
              ? failure.message
              : "No pudimos confirmar la conexión. Actualizá para continuar.",
          );
          if (failure instanceof Error && !navigator.onLine) setNotice("");
        }
      } finally {
        clearTimeout(timeout);
        if (live && controller === own)
          poll = setTimeout(() => void load(), 5000);
      }
    };
    const wake = () => {
      if (!document.hidden) {
        setError("Actualizando tus tareas…");
        void load();
      }
    };
    const offline = () => {
      controller?.abort();
      setError("Sin conexión. Actualizá tus tareas al recuperar internet.");
    };
    const initial = setTimeout(() => void load(), 0);
    const timer = setInterval(() => setClock(Date.now()), 1000);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    window.addEventListener("offline", offline);
    document.addEventListener("visibilitychange", wake);
    return () => {
      live = false;
      clearTimeout(initial);
      clearTimeout(poll);
      clearInterval(timer);
      controller?.abort();
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("offline", offline);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [branchId, key, version]);
  const current = snapshot?.key === key ? snapshot : null;
  const data = current?.data;
  const fresh = !!current && !error && clock - current.receivedAt <= 15000;
  const locked = !fresh || preparation.locked || production.locked;
  const refresh = () => {
    setNotice("");
    setSnapshot((current) =>
      current ? { ...current, receivedAt: 0 } : current,
    );
    setVersion((value) => value + 1);
  };
  return (
    <section
      className="surface-panel space-y-4 p-4 sm:p-5"
      aria-label="Mi trabajo"
    >
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-brand">
            {showTabControls
              ? "Mi trabajo"
              : tab === "production"
                ? "Producción"
                : "Mis tareas"}
          </h2>
          <p className="mt-1 text-sm text-muted">
            Tus pedidos por puesto y producción asignada.
          </p>
        </div>
        <Button
          variant="outline"
          size="icon"
          aria-label="Actualizar mis tareas"
          onClick={refresh}
        >
          <RefreshCw size={17} />
        </Button>
      </header>
      {showTabControls && (
        <div
          className="grid grid-cols-2 gap-1 rounded-lg bg-surface p-1"
          role="group"
          aria-label="Tipo de tarea"
        >
          <Button
            variant={tab === "preparation" ? "default" : "ghost"}
            aria-pressed={tab === "preparation"}
            onClick={() => setTab("preparation")}
          >
            Mis tareas{data ? ` · ${data.preparation.rows.length}` : ""}
          </Button>
          <Button
            variant={tab === "production" ? "default" : "ghost"}
            aria-pressed={tab === "production"}
            onClick={() => setTab("production")}
          >
            Producción{data ? ` · ${data.production.rows.length}` : ""}
          </Button>
        </div>
      )}
      {notice && <OperationAlert title="Cambio guardado" message={notice} />}
      {(error || preparation.error || production.error) && (
        <OperationAlert
          tone="error"
          title="Revisá tus tareas"
          message={error || preparation.error || production.error || ""}
        />
      )}
      {(preparation.uncertain || production.uncertain) && (
        <Button
          variant="outline"
          onClick={() =>
            preparation.uncertain ? preparation.retry() : production.retry()
          }
        >
          Confirmar el mismo envío
        </Button>
      )}
      {(preparation.canDiscard || production.canDiscard) && (
        <div className="space-y-2">
          <p className="text-sm text-muted">
            El permiso cambió. Consultá el estado guardado de tus tareas antes
            de continuar.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              const discarded = preparation.canDiscard
                ? preparation.discardRejected()
                : production.discardRejected();
              if (discarded) refresh();
            }}
          >
            Descartar envío y actualizar
          </Button>
        </div>
      )}
      {!data && (
        <p role="status" className="py-4 text-sm text-muted">
          Cargando tus tareas…
        </p>
      )}
      {data && !data.ready && (
        <p className="py-4 text-sm text-muted">
          Administración debe habilitar la organización de puestos para mostrar
          tus tareas.
        </p>
      )}
      {data?.ready && tab === "preparation" && (
        <>
          {data.assignments.length > 0 && (
            <p className="text-xs font-semibold text-muted">
              Tu puesto:{" "}
              {[...new Set(data.assignments.map((a) => a.stationName))].join(
                " · ",
              )}
            </p>
          )}
          {data.preparation.rows.length === 0 && (
            <p className="py-5 text-sm text-muted">
              {data.assignments.some((a) => a.stationId)
                ? "No tenés pedidos pendientes en tu puesto."
                : "Todavía no tenés un puesto de preparación asignado para este horario."}
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {data.preparation.rows.map((task) => (
              <PreparationWorkCard
                key={task.id}
                task={task}
                locked={locked}
                onAct={(target, action) => {
                  if (locked || active.current) return;
                  active.current = true;
                  setNotice("");
                  preparation.submit(`/api/preparation/${target.id}`, {
                    requestId: crypto.randomUUID(),
                    revision: target.revision,
                    action,
                  });
                  active.current = false;
                }}
              />
            ))}
          </div>
          {data.preparation.hasMore && (
            <p className="text-xs text-muted">
              Se muestran los primeros 100 pedidos pendientes.
            </p>
          )}
        </>
      )}
      {data?.ready && tab === "production" && (
        <>
          <p className="text-xs text-muted">
            La producción asignada se registra en Depósito.
          </p>
          {data.production.rows.length === 0 && (
            <p className="py-5 text-sm text-muted">
              No tenés producción pendiente asignada.
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {data.production.rows.map((order) => (
              <ProductionWorkCard
                key={`${order.id}:${order.revision}`}
                order={order}
                locked={locked}
                timeZone={data.branch.timeZone}
                onAct={(target, action) => {
                  if (locked || active.current) return;
                  active.current = true;
                  setNotice("");
                  production.submit(`/api/production/orders/${target.id}`, {
                    requestId: crypto.randomUUID(),
                    ...(action === "start"
                      ? { start: { expectedRevision: target.revision } }
                      : { completion: { expectedRevision: target.revision } }),
                  });
                  active.current = false;
                }}
              />
            ))}
          </div>
          {data.production.hasMore && (
            <p className="text-xs text-muted">
              Se muestran las primeras 100 tareas asignadas.
            </p>
          )}
        </>
      )}
    </section>
  );
}
