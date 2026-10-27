"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { OperationNotice } from "@/components/sales/shared";
import {
  SupplyPolicyEditor,
  type SupplyInput,
} from "@/components/inventory/supply-policy-editor";
import { getJson, useOperation } from "@/components/inventory/shared";
import type { SupplySnapshot } from "@/modules/supply-alerts/types";

const endpoint = "/api/inventory/supply-alerts";
export function ItemPurchaseSettings({
  itemId,
  actorId,
  onBusy,
  onSaved,
  onCancel,
}: {
  itemId: string;
  actorId: string;
  onBusy?: (busy: boolean) => void;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const [data, setData] = useState<SupplySnapshot | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [notice, setNotice] = useState("");
  const generation = useRef(0);
  const load = useCallback(async () => {
    const ticket = ++generation.current;
    setLoading(true);
    try {
      const next = await getJson<SupplySnapshot>(endpoint);
      if (ticket === generation.current) {
        setData(next);
        setError("");
      }
    } catch (e) {
      if (ticket === generation.current)
        setError(
          e instanceof Error
            ? e.message
            : "No pudimos consultar la configuración.",
        );
    } finally {
      if (ticket === generation.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    const initial = setTimeout(() => void load(), 0);
    return () => {
      clearTimeout(initial);
      // Numeric request version, not a DOM ref: invalidate reads on unmount.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++;
    };
  }, [load]);
  const saved = useCallback(() => {
    setNotice("Configuración guardada para esta sucursal.");
    void load();
    onSaved?.();
  }, [load, onSaved]);
  const operation = useOperation<{ requestId: string; policy: SupplyInput }>(
    actorId,
    "supply-alerts",
    saved,
  );
  useEffect(() => {
    onBusy?.(operation.locked);
    return () => onBusy?.(false);
  }, [operation.locked, onBusy]);
  const policy = data?.policies.find((p) => p.itemId === itemId);
  const item = data?.items.find((i) => i.id === itemId);
  return (
    <div className="space-y-5">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Definí la anticipación de compra de este insumo. Los mínimos para
        reponer Barra o Cocina se administran en «Mínimos de reposición».
      </p>
      {loading && (
        <p role="status" className="text-sm">
          Consultando configuración…
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <OperationNotice
        error={operation.error}
        eventKey={operation.errorAttempt}
        uncertain={operation.uncertain}
        busy={operation.busy}
        retry={operation.retry}
      />
      {notice && (
        <p
          role="status"
          className="rounded-lg bg-blue-50 p-3 text-sm text-brand"
        >
          {notice}
        </p>
      )}
      {(error || operation.status === 409) && (
        <Button
          type="button"
          variant="outline"
          disabled={loading || operation.locked}
          onClick={async () => {
            await load();
            operation.clearError();
          }}
        >
          Actualizar configuración
        </Button>
      )}
      {data && !data.available && (
        <p role="status" className="rounded-lg bg-blue-50 p-4 text-sm">
          La configuración de compras está pendiente de activación.
        </p>
      )}
      {data?.available && !item && !loading && !error && (
        <p role="status" className="text-sm">
          Este insumo debe estar activo, ser comprable y tener control de stock
          para configurar avisos.
        </p>
      )}
      {data?.available && item && (
        <SupplyPolicyEditor
          key={`${itemId}:${policy?.revision ?? "new"}`}
          fixedItemId={itemId}
          policy={policy}
          snapshot={data}
          locked={
            loading ||
            !!error ||
            operation.locked ||
            (operation.status === 409 && !!operation.error)
          }
          onCancel={onCancel ?? (() => {})}
          onSave={(policy) =>
            operation.submit(endpoint, {
              requestId: crypto.randomUUID(),
              policy,
            })
          }
        />
      )}
    </div>
  );
}
