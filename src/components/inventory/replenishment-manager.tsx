"use client";
import { useCallback, useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OperationAlert } from "@/components/ui/operation-alert";
import { OperationNotice } from "@/components/sales/shared";
import { quantity } from "@/lib/number-format";
import type { ReplenishmentPolicy } from "@/modules/replenishment/types";
import { useOperation } from "./shared";
import { useReplenishmentSnapshot } from "./use-replenishment-snapshot";
import {
  ReplenishmentPolicyEditor,
  type RuleInput,
} from "./replenishment-policy-editor";

const endpoint = "/api/inventory/replenishment";
type RuleCommand = { requestId: string; policy: RuleInput };

export function ReplenishmentManager({ actorId }: { actorId: string }) {
  const { snapshot, loading, error, reload } = useReplenishmentSnapshot();
  const [editing, setEditing] = useState<ReplenishmentPolicy | "new" | null>(
    null,
  );
  const [notice, setNotice] = useState("");
  const saved = useCallback(() => {
    setEditing(null);
    setNotice("Mínimo guardado.");
    reload();
  }, [reload]);
  const operation = useOperation<RuleCommand>(actorId, "replenishment", saved);
  const blocked = operation.locked || loading || !!error || !snapshot;

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-muted">
          Inventario y compras
        </p>
        <h1 className="text-3xl font-bold tracking-tight text-brand">
          Mínimos de reposición
        </h1>
        <p className="max-w-3xl text-sm leading-relaxed text-muted sm:text-base">
          Definí cuánto stock necesita cada ubicación de la sucursal
          seleccionada. Estas reglas generan avisos para el encargado y sugieren
          el destino de los traslados.
        </p>
      </header>
      <Link
        href="/inventory/supply-alerts"
        className="inline-flex min-h-12 items-center rounded-lg border border-line bg-white px-4 text-sm font-semibold text-brand"
      >
        Configurar compras anticipadas de Bolivia
      </Link>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          className="min-h-12"
          disabled={blocked || editing !== null}
          onClick={() => {
            setEditing("new");
            setNotice("");
          }}
        >
          <Plus size={18} aria-hidden="true" /> Agregar mínimo
        </Button>
        <Button
          className="min-h-12"
          variant="outline"
          disabled={loading || operation.locked}
          onClick={reload}
        >
          <RefreshCw size={16} aria-hidden="true" /> Actualizar
        </Button>
      </div>
      <OperationAlert
        title="No pudimos consultar los mínimos"
        message={error}
        tone="error"
      />
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
      {loading && (
        <p role="status" className="text-sm text-muted">
          Actualizando mínimos…
        </p>
      )}
      {editing && snapshot && (
        <ReplenishmentPolicyEditor
          key={editing === "new" ? "new" : `${editing.id}:${editing.revision}`}
          snapshot={snapshot}
          policy={editing === "new" ? undefined : editing}
          locked={blocked}
          onCancel={() => setEditing(null)}
          onSave={(policy) =>
            operation.submit(endpoint, {
              requestId: crypto.randomUUID(),
              policy,
            })
          }
        />
      )}
      {!loading && !error && snapshot && (
        <section
          aria-label="Mínimos configurados"
          className="overflow-hidden rounded-xl border border-line bg-white"
        >
          <div className="border-b border-line p-4 sm:p-5">
            <h2 className="font-semibold text-brand">
              Reglas por artículo y ubicación
            </h2>
            <p className="mt-1 text-sm leading-relaxed text-muted">
              El mínimo indica cuándo reponer y el objetivo cuánto querés tener.
              Desactivá una regla cuando ya no corresponda al negocio.
            </p>
          </div>
          {!snapshot.policies.length ? (
            <div className="space-y-1 p-5 text-sm text-muted">
              <p className="font-medium text-brand">
                Todavía no hay mínimos configurados.
              </p>
              <p>
                Empezá por un insumo y su ubicación habitual, por ejemplo leche
                en Barra o fiambre en Cocina.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line">
              {snapshot.policies.map((policy) => (
                <li
                  key={policy.id}
                  className="flex flex-wrap items-center justify-between gap-4 p-4 sm:p-5"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-semibold text-brand">
                      {policy.itemName}{" "}
                      <span className="font-normal text-muted">
                        · {policy.locationName}
                      </span>
                    </p>
                    <p className="text-sm text-muted">
                      Mínimo {quantity(policy.minimumQuantity, policy.baseUnit)}{" "}
                      · Objetivo{" "}
                      {quantity(policy.targetQuantity, policy.baseUnit)}
                    </p>
                    {!policy.enabled && (
                      <p className="text-xs font-medium text-muted">
                        Desactivada
                      </p>
                    )}
                  </div>
                  <Button
                    variant="outline"
                    className="min-h-12"
                    disabled={blocked || editing !== null}
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
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
