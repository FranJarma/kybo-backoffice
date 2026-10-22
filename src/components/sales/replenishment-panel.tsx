"use client";
import Link from "next/link";
import { FieldCaption } from "@/components/ui/field-caption";
import { OperationAlert } from "@/components/ui/operation-alert";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Bell, ChefHat, RefreshCw, ShoppingCart, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchCombobox } from "@/components/ui/search-combobox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useOperation } from "@/components/inventory/shared";
import { OperationNotice } from "@/components/sales/shared";
import type { Actor } from "@/lib/access";
import { paths } from "@/lib/navigation";
import { quantity } from "@/lib/number-format";
import type {
  ReplenishmentAlert,
  ReplenishmentPolicy,
  ReplenishmentSnapshot,
} from "@/modules/replenishment/types";

const endpoint = "/api/inventory/replenishment";
const touch = "min-h-12";
const labelClass = "grid min-w-0 gap-2 text-sm font-medium text-brand";
type RuleInput = {
  id?: string;
  revision?: number;
  itemId: string;
  locationId: string;
  minimumQuantity: string;
  targetQuantity: string;
  preparationMinutes: number | null;
  enabled: boolean;
};
type RuleCommand = { requestId: string; policy: RuleInput };

function branchId() {
  return (
    document.cookie
      .split("; ")
      .find((cookie) => cookie.startsWith("kybo-branch="))
      ?.split("=")[1] ?? ""
  );
}

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
              : "Configurá mínimos por artículo y ubicación para anticipar reposiciones y producción. Sin reglas activas todavía no podemos detectar faltantes."}
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

function ruleDraft(
  policy?: ReplenishmentPolicy,
): RuleInput & { minutes: string } {
  const editable = (value: string) =>
    value
      .replace(/(\.\d*?)0+$/, "$1")
      .replace(/\.$/, "")
      .replace(".", ",");
  return policy
    ? {
        id: policy.id,
        revision: policy.revision,
        itemId: policy.itemId,
        locationId: policy.locationId,
        minimumQuantity: editable(policy.minimumQuantity),
        targetQuantity: editable(policy.targetQuantity),
        preparationMinutes: policy.preparationMinutes,
        minutes:
          policy.preparationMinutes === null
            ? ""
            : String(policy.preparationMinutes),
        enabled: policy.enabled,
      }
    : {
        itemId: "",
        locationId: "",
        minimumQuantity: "",
        targetQuantity: "",
        preparationMinutes: null,
        minutes: "",
        enabled: true,
      };
}

function PolicyEditor({
  snapshot,
  policy,
  locked,
  onSave,
  onCancel,
}: {
  snapshot: ReplenishmentSnapshot;
  policy?: ReplenishmentPolicy;
  locked: boolean;
  onSave: (rule: RuleInput) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(() => ruleDraft(policy));
  const [formError, setFormError] = useState("");
  const item = snapshot.items.find((row) => row.id === draft.itemId);
  return (
    <form
      className="space-y-5 rounded-xl border border-line bg-surface/50 p-4 sm:p-5"
      onSubmit={(event) => {
        event.preventDefault();
        const validQuantity = /^\d+(?:,\d{1,6})?$/;
        const min = Number(draft.minimumQuantity.replace(",", "."));
        const target = Number(draft.targetQuantity.replace(",", "."));
        if (
          !draft.itemId ||
          !draft.locationId ||
          !validQuantity.test(draft.minimumQuantity) ||
          !validQuantity.test(draft.targetQuantity) ||
          target <= 0 ||
          (draft.enabled ? target <= min : target < min) ||
          (draft.minutes !== "" &&
            (!/^\d+$/.test(draft.minutes) || Number(draft.minutes) < 1))
        ) {
          setFormError(
            "Elegí artículo y ubicación. Usá cantidades con coma decimal y objetivo mayor al mínimo para una regla activa; el tiempo debe ser un número entero positivo.",
          );
          return;
        }
        setFormError("");
        const { minutes, ...rule } = draft;
        onSave({
          ...rule,
          preparationMinutes: minutes === "" ? null : Number(minutes),
        });
      }}
    >
      <h3 className="font-semibold text-brand">
        {policy ? "Editar mínimo" : "Nuevo mínimo"}
      </h3>
      <fieldset
        disabled={locked}
        className="grid gap-5 sm:grid-cols-2 [&_input[role=combobox]]:min-h-12 [&_[role=option]]:min-h-12"
      >
        <div className={labelClass}>
          <label htmlFor={`${id}-item`}>
            <FieldCaption required>Artículo</FieldCaption>
          </label>
          <SearchCombobox
            id={`${id}-item`}
            label="Artículo"
            value={draft.itemId}
            selectedLabel={item?.name ?? policy?.itemName ?? ""}
            options={snapshot.items}
            required
            disabled={!!policy}
            onSearch={() => {}}
            onChange={(itemId) =>
              setDraft((current) => ({ ...current, itemId }))
            }
          />
        </div>
        <label className={labelClass}>
          <FieldCaption required>Ubicación</FieldCaption>
          <select
            required
            disabled={!!policy}
            className="min-h-12 rounded-lg border border-line bg-white px-3 text-sm"
            value={draft.locationId}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                locationId: event.target.value,
              }))
            }
          >
            <option value="">Seleccioná una ubicación</option>
            {snapshot.locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
        <label className={labelClass}>
          <FieldCaption required>
            Mínimo (
            {item?.baseUnit === "unit"
              ? "unid."
              : item?.baseUnit || policy?.baseUnit || "unidad base"}
            )
          </FieldCaption>
          <Input
            className={touch}
            required
            inputMode="decimal"
            placeholder="Por ejemplo: 1000"
            value={draft.minimumQuantity}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                minimumQuantity: event.target.value,
              }))
            }
          />
        </label>
        <label className={labelClass}>
          <FieldCaption required>
            Objetivo (
            {item?.baseUnit === "unit"
              ? "unid."
              : item?.baseUnit || policy?.baseUnit || "unidad base"}
            )
          </FieldCaption>
          <Input
            className={touch}
            required
            inputMode="decimal"
            value={draft.targetQuantity}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                targetQuantity: event.target.value,
              }))
            }
          />
        </label>
        <label className={labelClass}>
          Tiempo estimado de preparación (min)
          <Input
            className={touch}
            inputMode="numeric"
            placeholder="Opcional"
            value={draft.minutes}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                minutes: event.target.value,
              }))
            }
          />
        </label>
        <label className="flex min-h-12 items-center gap-3 self-end text-sm text-brand">
          <input
            type="checkbox"
            className="size-6"
            checked={draft.enabled}
            onChange={(event) =>
              setDraft((current) => ({
                ...current,
                enabled: event.target.checked,
              }))
            }
          />
          Regla activa
        </label>
      </fieldset>
      <p className="text-xs leading-relaxed text-muted">
        Cantidades en la unidad base del artículo. El tiempo es una referencia
        para organizar la tanda; esta primera versión avisa por mínimos y
        todavía no pronostica consumo.
      </p>
      {formError && (
        <OperationAlert
          tone="error"
          title="No pudimos completar la operación"
          message={formError}
        />
      )}
      <div className="flex flex-wrap justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          className={touch}
          disabled={locked}
          onClick={onCancel}
        >
          Cancelar edición
        </Button>
        <Button type="submit" className={touch} disabled={locked}>
          {locked ? "Guardando…" : "Guardar mínimo"}
        </Button>
      </div>
    </form>
  );
}

export function ReplenishmentPanel({
  role,
  actorId,
  refresh,
}: {
  role: Actor["role"];
  actorId: string;
  refresh: number;
}) {
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<ReplenishmentSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [settings, setSettings] = useState(false);
  const [editing, setEditing] = useState<ReplenishmentPolicy | "new" | null>(
    null,
  );
  const [notice, setNotice] = useState("");
  const controller = useRef<AbortController | null>(null);
  const manager = role !== "staff";
  const saved = useCallback(() => {
    setEditing(null);
    setNotice("Mínimo guardado.");
    setReload((current) => current + 1);
  }, []);
  const operation = useOperation<RuleCommand>(actorId, "replenishment", saved);
  useEffect(() => {
    let disposed = false;
    let sequence = 0;
    async function load() {
      controller.current?.abort();
      const request = new AbortController();
      controller.current = request;
      const current = ++sequence;
      const branch = branchId();
      setLoading(true);
      try {
        const response = await fetch(endpoint, {
          cache: "no-store",
          signal: request.signal,
          headers: branch ? { "X-Kybo-Branch-Id": branch } : {},
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(
            body.error || "No pudimos consultar las alertas de reposición.",
          );
        }
        const data = (await response.json()) as ReplenishmentSnapshot;
        if (!disposed && current === sequence && branch === branchId()) {
          setSnapshot(data);
          setError("");
        }
      } catch (reason) {
        if (!disposed && current === sequence && !request.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "No pudimos consultar las alertas de reposición.",
          );
      } finally {
        if (!disposed && current === sequence) setLoading(false);
      }
    }
    const initial = setTimeout(() => {
      void load();
    }, 0);
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    const visible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      disposed = true;
      controller.current?.abort();
      clearTimeout(initial);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh, reload]);
  const count = snapshot?.alerts.length;
  const hasError = !!error || !!operation.error;
  return (
    <>
      <Button
        variant="outline"
        className={`${touch} gap-2 ${hasError ? "border-amber-300" : count ? "border-amber-300 bg-amber-50" : ""}`}
        onClick={() => setOpen(true)}
        aria-label={`Reposición${operation.uncertain ? ": envío pendiente de confirmar" : hasError ? ": no se pudo actualizar" : loading && !snapshot ? ": consultando" : count === undefined ? "" : `: ${count} pendientes`}`}
      >
        <Bell size={18} aria-hidden="true" />
        Reposición
        {snapshot && (
          <span className="rounded-md bg-surface px-2 py-1 text-xs font-semibold">
            {count}
          </span>
        )}
        {operation.uncertain ? (
          <span className="text-xs text-amber-800">Envío pendiente</span>
        ) : hasError ? (
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
                onClick={() => setReload((current) => current + 1)}
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
            {manager && (
              <section className="space-y-4 border-t border-line pt-5">
                <Button
                  variant="outline"
                  className={touch}
                  aria-expanded={settings}
                  onClick={() => setSettings((current) => !current)}
                >
                  {settings ? "Ocultar configuración" : "Configurar mínimos"}
                </Button>
                <OperationNotice
                  error={operation.error}
                  eventKey={operation.errorAttempt}
                  uncertain={operation.uncertain}
                  busy={operation.busy}
                  retry={operation.retry}
                />
                {notice && (
                  <p role="status" className="text-sm text-brand">
                    {notice}
                  </p>
                )}
                {settings && snapshot && (
                  <>
                    <div className="space-y-3">
                      {snapshot.policies.map((policy) => (
                        <div
                          key={policy.id}
                          className="flex items-center justify-between gap-3 rounded-lg border border-line p-3"
                        >
                          <div className="min-w-0 text-sm">
                            <p className="font-medium text-brand">
                              {policy.itemName} · {policy.locationName}
                            </p>
                            <p className="mt-1 text-xs text-muted">
                              {policy.enabled
                                ? `Mínimo ${quantity(policy.minimumQuantity, policy.baseUnit)} · Objetivo ${quantity(policy.targetQuantity, policy.baseUnit)}`
                                : "Desactivada"}
                            </p>
                          </div>
                          <Button
                            variant="outline"
                            className={touch}
                            disabled={operation.locked}
                            onClick={() => {
                              setEditing(policy);
                              setNotice("");
                            }}
                          >
                            Editar
                            <span className="sr-only">
                              {" "}
                              {policy.itemName} en {policy.locationName}
                            </span>
                          </Button>
                        </div>
                      ))}
                    </div>
                    {!editing && (
                      <Button
                        variant="outline"
                        className={touch}
                        disabled={operation.locked}
                        onClick={() => {
                          setEditing("new");
                          setNotice("");
                        }}
                      >
                        Agregar mínimo
                      </Button>
                    )}
                    {editing && (
                      <PolicyEditor
                        key={
                          editing === "new"
                            ? "new"
                            : `${editing.id}:${editing.revision}`
                        }
                        snapshot={snapshot}
                        policy={editing === "new" ? undefined : editing}
                        locked={operation.locked}
                        onCancel={() => setEditing(null)}
                        onSave={(policy) =>
                          operation.submit(endpoint, {
                            requestId: crypto.randomUUID(),
                            policy,
                          })
                        }
                      />
                    )}
                  </>
                )}
              </section>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
