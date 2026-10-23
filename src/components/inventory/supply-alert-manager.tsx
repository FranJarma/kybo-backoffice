"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Plus, RefreshCw, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OperationAlert } from "@/components/ui/operation-alert";
import { OperationNotice } from "@/components/sales/shared";
import { quantity } from "@/lib/number-format";
import type {
  SupplyPolicy,
  SupplySnapshot,
} from "@/modules/supply-alerts/types";
import { urgencyLabels, urgencyColors } from "../daily-operations/task-list";
import { useOperation } from "./shared";
import { SupplyPolicyEditor, type SupplyInput } from "./supply-policy-editor";
const endpoint = "/api/inventory/supply-alerts";
export function SupplyAlertManager({ actorId }: { actorId: string }) {
  const [data, setData] = useState<SupplySnapshot | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [editing, setEditing] = useState<SupplyPolicy | "new" | null>(null),
    [notice, setNotice] = useState("");
  const generation = useRef(0);
  const load = useCallback(async () => {
    const ticket = ++generation.current;
    setLoading(true);
    try {
      const response = await fetch(endpoint, { cache: "no-store" }),
        body = await response.json();
      if (!response.ok)
        throw new Error(
          body.error ?? "No pudimos consultar las compras anticipadas.",
        );
      if (ticket === generation.current) {
        setData(body);
        setError("");
      }
    } catch (e) {
      if (ticket === generation.current)
        setError(
          e instanceof Error ? e.message : "No pudimos consultar las compras.",
        );
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    return () => {
      // This numeric generation intentionally invalidates the latest pending read;
      // it is not a DOM ref whose value should be captured at effect setup.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
      clearTimeout(initial);
    };
  }, [load]);
  const saved = useCallback(() => {
    setEditing(null);
    setNotice(
      "Regla de compra guardada. Operación del día la toma al actualizar.",
    );
    void load();
  }, [load]);
  const operation = useOperation<{ requestId: string; policy: SupplyInput }>(
    actorId,
    "supply-alerts",
    saved,
  );
  const locked = loading || !!error || operation.locked || !data?.available;
  const rank = { critical: 0, high: 1, scheduled: 2 };
  const rows = [...(data?.policies ?? [])].sort((a, b) => {
    const x = data?.alerts.find((r) => r.itemId === a.itemId),
      y = data?.alerts.find((r) => r.itemId === b.itemId);
    return (
      (x?.urgency ? rank[x.urgency] : 3) - (y?.urgency ? rank[y.urgency] : 3) ||
      (x?.orderBy ?? "9999").localeCompare(y?.orderBy ?? "9999") ||
      a.itemName.localeCompare(b.itemName)
    );
  });
  return (
    <div className="mx-auto max-w-6xl space-y-6 text-brand">
      <header className="flex flex-wrap justify-between gap-4 border-b border-line pb-6">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            Inventario y compras
          </p>
          <h1 className="mt-2 text-3xl font-bold">Compras de Bolivia</h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Anticipá el trámite con una semana de plazo y tres días de margen.
            La cobertura reúne el stock de Depósito, Barra y Cocina.
          </p>
        </div>
        <Link
          href="/operations/day"
          className="inline-flex min-h-12 items-center gap-2 self-start rounded-lg border border-line bg-white px-4 text-sm font-semibold"
        >
          Ver tareas del día <ArrowUpRight className="size-4" />
        </Link>
      </header>
      <p className="text-sm text-muted-foreground">
        Regla inicial: 7 días de plazo + 3 de margen. Si editás esos días para
        un insumo, su urgencia utiliza los valores de esa regla.
      </p>
      <div className="grid gap-4 border-l-4 border-primary bg-orange-50 px-5 py-4 text-sm sm:grid-cols-3">
        <p>
          <strong className="block text-red-800">Crítica · hasta 7 días</strong>
          <span className="text-muted-foreground">
            Hay riesgo de quedarse sin stock antes de reponer.
          </span>
        </p>
        <p>
          <strong className="block text-orange-900">
            Alta · de 7 a 10 días
          </strong>
          <span className="text-muted-foreground">
            Es momento de tramitar la compra.
          </span>
        </p>
        <p>
          <strong className="block">Programada · más de 10 días</strong>
          <span className="text-muted-foreground">
            Podés organizar el próximo pedido.
          </span>
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button
          className="min-h-12"
          disabled={locked || editing !== null}
          onClick={() => {
            setEditing("new");
            setNotice("");
          }}
        >
          <Plus className="size-4" />
          Agregar insumo
        </Button>
        <Button
          variant="outline"
          className="min-h-12"
          disabled={loading || operation.locked}
          onClick={() => void load()}
        >
          <RefreshCw className="size-4" />
          Actualizar
        </Button>
      </div>
      <OperationAlert
        title="No pudimos consultar las compras"
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
        <p role="status" className="text-sm">
          {notice}
        </p>
      )}
      {data && !data.available && (
        <p
          role="status"
          className="rounded-lg border border-blue-200 bg-blue-50 p-5 text-sm"
        >
          Compras anticipadas está pendiente de activación en la base de datos.
          Las tareas y reposiciones actuales siguen disponibles.
        </p>
      )}
      {editing && data && (
        <SupplyPolicyEditor
          key={editing === "new" ? "new" : `${editing.id}:${editing.revision}`}
          policy={editing === "new" ? undefined : editing}
          snapshot={data}
          locked={locked}
          onCancel={() => setEditing(null)}
          onSave={(policy) =>
            operation.submit(endpoint, {
              requestId: crypto.randomUUID(),
              policy,
            })
          }
        />
      )}
      {data?.available && (
        <section
          aria-label="Insumos por urgencia"
          className="divide-y divide-line overflow-hidden rounded-xl border border-line bg-white"
        >
          {!rows.length && (
            <p className="p-6 text-sm text-muted-foreground">
              Agregá los insumos y su consumo diario para empezar a calcular
              avisos de compra.
            </p>
          )}
          {rows.map((p) => {
            const a = data.alerts.find((r) => r.itemId === p.itemId);
            const coverage = a?.coverageDays
              ? `${a.coverageAtLeast ? "≥ " : ""}${quantity(a.coverageDays)} días`
              : a?.status === "no_consumption"
                ? "Sin consumo estimado"
                : "Falta estimar consumo";
            return (
              <article key={p.id} className="space-y-4 p-4 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 space-y-2">
                    <span
                      className={`inline-block rounded-md border px-2 py-1 text-xs font-semibold ${a?.urgency ? urgencyColors[a.urgency] : "border-line bg-surface text-brand"}`}
                    >
                      {!p.enabled
                        ? "Desactivada"
                        : a?.urgency
                          ? urgencyLabels[a.urgency]
                          : a?.status === "covered"
                            ? "Objetivo cubierto"
                            : "Sin consumo estimado"}
                    </span>
                    <h2 className="text-lg font-semibold">{p.itemName}</h2>
                  </div>
                  <Button
                    variant="outline"
                    className="min-h-12"
                    disabled={locked || editing !== null}
                    onClick={() => {
                      setEditing(p);
                      setNotice("");
                    }}
                  >
                    Editar<span className="sr-only"> {p.itemName}</span>
                  </Button>
                </div>
                {p.enabled && (
                  <div className="grid gap-3 text-sm sm:grid-cols-3">
                    <p>
                      <span className="block text-muted-foreground">
                        Cobertura aproximada
                      </span>
                      <strong className="mt-1 block text-lg">{coverage}</strong>
                    </p>
                    <p>
                      <span className="block text-muted-foreground">
                        Tramitar hasta
                      </span>
                      <strong className="mt-1 block">
                        {a?.status === "action" && a.orderBy
                          ? a.orderBy.split("-").reverse().join("/")
                          : "—"}
                      </strong>
                    </p>
                    <p>
                      <span className="block text-muted-foreground">
                        Compra sugerida · objetivo {p.targetDays} días
                      </span>
                      <strong className="mt-1 block">
                        {a?.status === "action"
                          ? quantity(a.suggestedQuantity, p.baseUnit)
                          : "—"}
                      </strong>
                    </p>
                  </div>
                )}
                <details className="text-sm">
                  <summary className="min-h-10 cursor-pointer py-2 font-medium text-blue-700">
                    Ver cálculo y condiciones
                  </summary>
                  <div className="space-y-2 pt-2 text-muted-foreground">
                    <p>
                      Disponible recibido:{" "}
                      {a ? quantity(a.availableQuantity, p.baseUnit) : "—"}.
                      Consumo diario manual:{" "}
                      {p.dailyConsumption !== null
                        ? quantity(p.dailyConsumption, p.baseUnit)
                        : "sin estimar"}
                      .
                    </p>
                    <p>
                      Plazo {p.leadDays} días + margen {p.safetyDays} días. Se
                      consideran reservas y vencimientos; los traslados internos
                      conservan el stock de la sucursal.
                    </p>
                    <p>
                      Revisá los pedidos en trámite antes de comprar: aquí se
                      calcula con mercadería ya recibida.
                    </p>
                  </div>
                </details>
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
