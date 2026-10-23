"use client";
import Link from "next/link";
import { useState } from "react";
import { Bell, ChefHat, RefreshCw, ShoppingCart, Truck } from "lucide-react";
import { OperationAlert } from "@/components/ui/operation-alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useReplenishmentSnapshot } from "@/components/inventory/use-replenishment-snapshot";
import type { Actor } from "@/lib/access";
import { paths } from "@/lib/navigation";
import { quantity } from "@/lib/number-format";
import type {
  ReplenishmentAlert,
  ReplenishmentSnapshot,
} from "@/modules/replenishment/types";
const touch = "min-h-12";
function AlertCard({
  alert,
  role,
}: {
  alert: ReplenishmentAlert;
  role: Actor["role"];
}) {
  const manager = role !== "staff";
  const action =
    alert.kind === "transfer"
      ? "Reponer"
      : alert.kind === "production"
        ? "Preparar"
        : "Revisar compra";
  const Icon =
    alert.kind === "transfer"
      ? Truck
      : alert.kind === "production"
        ? ChefHat
        : ShoppingCart;
  return (
    <article
      className={`rounded-xl border p-4 sm:p-5 ${alert.severity === "empty" ? "border-red-200 bg-red-50/40" : "border-amber-200 bg-amber-50/40"}`}
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted">
            <Icon size={16} aria-hidden="true" />
            {action} · {alert.locationName}
          </p>
          <h3 className="text-lg font-semibold text-brand">{alert.itemName}</h3>
        </div>
        <span className="rounded-md bg-white px-2 py-1 text-xs font-semibold text-brand">
          {alert.severity === "empty" ? "Sin disponible" : "Stock bajo"}
        </span>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-muted">Disponible para usar</dt>
          <dd className="mt-1 text-lg font-semibold text-brand">
            {quantity(alert.availableQuantity, alert.baseUnit)}
          </dd>
        </div>
        <div>
          <dt className="text-muted">
            {alert.kind === "transfer"
              ? "Reposición sugerida"
              : "Falta para el objetivo"}
          </dt>
          <dd className="mt-1 text-lg font-semibold text-brand">
            {quantity(alert.suggestedQuantity, alert.baseUnit)}
          </dd>
        </div>
      </dl>
      {alert.kind === "transfer" &&
        Number(alert.suggestedQuantity) <
          Number(alert.targetQuantity) - Number(alert.availableQuantity) && (
          <p className="mt-2 text-sm text-amber-950">
            El stock de otras ubicaciones cubre solo una parte del faltante.
            Coordiná con el encargado cómo completar el objetivo.
          </p>
        )}
      <p className="mt-2 text-xs text-muted">
        Mínimo: {quantity(alert.minimumQuantity, alert.baseUnit)} · Objetivo:{" "}
        {quantity(alert.targetQuantity, alert.baseUnit)}
        {alert.preparationMinutes !== null
          ? ` · Preparación estimada: ${alert.preparationMinutes} min`
          : ""}
      </p>
      {alert.sources.length > 0 && (
        <div className="mt-4 rounded-lg bg-white p-3 text-sm">
          <p className="font-medium text-brand">
            Disponible en otras ubicaciones
          </p>
          {alert.sources.map((source) => (
            <p key={source.locationId} className="mt-1 text-muted">
              {source.locationName}:{" "}
              {quantity(source.availableQuantity, alert.baseUnit)}
            </p>
          ))}
        </div>
      )}
      {alert.activeProduction.length > 0 && (
        <div className="mt-4 rounded-lg border border-line bg-white p-3 text-sm">
          <p className="font-medium text-brand">
            Producción pendiente · no suma stock disponible
          </p>
          {alert.activeProduction.map((order) => (
            <p key={order.id} className="mt-2 text-muted">
              {quantity(order.plannedQuantity, alert.baseUnit)} ·{" "}
              {order.state === "confirmed"
                ? order.startedAt
                  ? "En preparación"
                  : "Pendiente de comenzar"
                : "Planificada"}{" "}
              · {order.assignedToName || "Sin asignar"}
            </p>
          ))}
          <p className="mt-2 text-xs text-muted">
            Revisá estas órdenes antes de planificar otra tanda.
          </p>
        </div>
      )}
      <div className="mt-4">
        {manager ? (
          <Button asChild variant="outline" className={touch}>
            <a
              target="_blank"
              rel="noopener noreferrer"
              href={
                alert.kind === "production"
                  ? paths.production
                  : alert.kind === "transfer"
                    ? paths.transfers
                    : paths.purchases
              }
            >
              {alert.kind === "production"
                ? "Ver producción"
                : alert.kind === "transfer"
                  ? "Ver traslados"
                  : "Ver compras"}
            </a>
          </Button>
        ) : alert.kind === "production" ? (
          <Button asChild variant="outline" className={touch}>
            <a
              href={paths.production}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ver mis tareas
            </a>
          </Button>
        ) : (
          <p className="text-sm text-muted">
            Avisá al encargado para coordinar{" "}
            {alert.kind === "transfer" ? "la reposición" : "la compra"}.
          </p>
        )}
      </div>
      {(manager || alert.kind === "production") && (
        <p className="mt-2 text-xs text-muted">
          Se abre en otra pestaña para conservar el pedido actual.
        </p>
      )}
    </article>
  );
}

export function ReplenishmentContent({
  role,
  snapshot,
  loading,
  error,
}: {
  role: Actor["role"];
  snapshot: ReplenishmentSnapshot | null;
  loading: boolean;
  error: string;
}) {
  return (
    <div className="space-y-4">
      {loading && (
        <p role="status" className="text-sm text-muted">
          Actualizando existencias…
        </p>
      )}
      <OperationAlert
        title="No pudimos actualizar las existencias"
        message={error}
        tone="error"
      />
      {error && (
        <p role="status" className="text-sm text-muted">
          {snapshot
            ? "La última lectura puede haber cambiado. Actualizá para comprobar la reposición."
            : "La reposición está pendiente de comprobar. Actualizá para reintentar."}
        </p>
      )}
      {!loading &&
        !error &&
        snapshot &&
        !snapshot.policies.some((policy) => policy.enabled) && (
          <p className="rounded-xl border border-line bg-surface p-5 text-sm text-muted">
            {role === "staff"
              ? "Todavía no hay mínimos activos. Pedile al encargado que los configure para anticipar faltas de stock."
              : "Configurá mínimos por artículo y ubicación desde Inventario y compras para anticipar reposiciones y producción. Sin reglas activas todavía no podemos detectar faltantes."}
          </p>
        )}
      {!loading &&
        !error &&
        snapshot?.policies.some((policy) => policy.enabled) &&
        !snapshot.alerts.length && (
          <p
            role="status"
            className="rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950"
          >
            Dentro de los mínimos configurados. Esto solo contempla los
            artículos y ubicaciones con reglas activas.
          </p>
        )}
      {snapshot?.alerts.map((alert) => (
        <AlertCard key={alert.id} alert={alert} role={role} />
      ))}
    </div>
  );
}

export function ReplenishmentPanel({
  role,
  refresh,
}: {
  role: Actor["role"];
  actorId: string;
  refresh: number;
}) {
  const [open, setOpen] = useState(false);
  const { snapshot, loading, error, reload } =
    useReplenishmentSnapshot(refresh);
  const count = snapshot?.alerts.length;
  const hasError = !!error;
  return (
    <>
      <Button
        variant="outline"
        className={`${touch} gap-2 ${hasError ? "border-amber-300" : count ? "border-amber-300 bg-amber-50" : ""}`}
        onClick={() => setOpen(true)}
        aria-label={`Reposición${hasError ? ": no se pudo actualizar" : loading && !snapshot ? ": consultando" : count === undefined ? "" : `: ${count} pendientes`}`}
      >
        <Bell size={18} aria-hidden="true" />
        Reposición
        {snapshot && (
          <span className="rounded-md bg-surface px-2 py-1 text-xs font-semibold">
            {count}
          </span>
        )}
        {hasError ? (
          <span className="text-xs text-amber-800">Sin actualizar</span>
        ) : loading && !snapshot ? (
          <span className="text-xs text-muted">Consultando…</span>
        ) : !snapshot?.policies.some((policy) => policy.enabled) && snapshot ? (
          <span className="text-xs text-muted">Sin mínimos</span>
        ) : null}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="flex max-h-[calc(100dvh-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
          showCloseButton={false}
        >
          <DialogHeader className="shrink-0 border-b border-line p-5 text-left sm:p-6">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle>Reposición y producción</DialogTitle>
              <Link
                href="/operations/day"
                className="flex min-h-12 items-center text-sm font-semibold text-brand underline"
              >
                Abrir Operación del día
              </Link>
              <Button
                variant="outline"
                className={touch}
                onClick={() => setOpen(false)}
              >
                Cerrar
              </Button>
            </div>
            <DialogDescription>
              Anticipá faltantes en la sucursal seleccionada. Consultar estos
              avisos no mueve stock ni crea órdenes.
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs text-muted">
                {snapshot
                  ? `Última consulta: ${new Date(snapshot.asOf).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}`
                  : "Todavía no se consultaron existencias."}
              </p>
              <Button
                variant="outline"
                className={touch}
                disabled={loading}
                onClick={reload}
              >
                <RefreshCw size={16} aria-hidden="true" />
                Actualizar
              </Button>
            </div>
            <ReplenishmentContent
              role={role}
              snapshot={snapshot}
              loading={loading}
              error={error}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
