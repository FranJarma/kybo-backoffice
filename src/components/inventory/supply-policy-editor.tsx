"use client";
import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchCombobox } from "@/components/ui/search-combobox";
import type {
  SupplyPolicy,
  SupplySnapshot,
} from "@/modules/supply-alerts/types";
export type SupplyInput = {
  id?: string;
  revision?: number;
  itemId: string;
  dailyConsumption: string | null;
  leadDays: number;
  safetyDays: number;
  targetDays: number;
  enabled: boolean;
};
export function SupplyPolicyEditor({
  policy,
  snapshot,
  locked,
  onSave,
  onCancel,
  fixedItemId,
}: {
  policy?: SupplyPolicy;
  snapshot: SupplySnapshot;
  locked: boolean;
  onSave: (input: SupplyInput) => void;
  onCancel: () => void;
  fixedItemId?: string;
}) {
  const id = useId();
  const [itemId, setItem] = useState(policy?.itemId ?? fixedItemId ?? "");
  const [daily, setDaily] = useState(
    policy?.dailyConsumption
      ?.replace(/(\.\d*?)0+$/, "$1")
      .replace(/\.$/, "")
      .replace(".", ",") ?? "",
  );
  const [lead, setLead] = useState(String(policy?.leadDays ?? 7));
  const [safety, setSafety] = useState(String(policy?.safetyDays ?? 3));
  const [target, setTarget] = useState(String(policy?.targetDays ?? 17));
  const [enabled, setEnabled] = useState(policy?.enabled ?? true);
  const [error, setError] = useState("");
  const item = snapshot.items.find((i) => i.id === itemId);
  return (
    <form
      className="space-y-6 bg-white text-brand"
      onSubmit={(e) => {
        e.preventDefault();
        if (
          !itemId ||
          (daily !== "" && !/^\d+(?:,\d{1,6})?$/.test(daily)) ||
          !/^\d+$/.test(lead) ||
          !/^\d+$/.test(safety) ||
          !/^\d+$/.test(target) ||
          Number(lead) < 1 ||
          Number(lead) > 364 ||
          Number(safety) > 364 ||
          Number(target) > 365 ||
          Number(target) <= Number(lead) + Number(safety)
        ) {
          setError(
            "Revisá el consumo y los días. El objetivo debe superar el plazo más el margen.",
          );
          return;
        }
        onSave({
          ...(policy ? { id: policy.id, revision: policy.revision } : {}),
          itemId,
          dailyConsumption: daily || null,
          leadDays: Number(lead),
          safetyDays: Number(safety),
          targetDays: Number(target),
          enabled,
        });
      }}
    >
      <h2 className="text-lg font-semibold text-brand">Reposición y compras</h2>
      {!fixedItemId && (
        <div className="grid gap-2">
          <label htmlFor={`${id}-item`} className="text-sm font-medium">
            Insumo
          </label>
          <SearchCombobox
            id={`${id}-item`}
            label="Insumo"
            value={itemId}
            selectedLabel={item?.name ?? policy?.itemName ?? ""}
            options={snapshot.items}
            disabled={locked || !!policy}
            required
            onChange={setItem}
            onSearch={() => {}}
          />
        </div>
      )}
      <label className="flex min-h-12 items-center justify-between gap-3 text-sm font-semibold">
        Recibir avisos de compra
        <input
          type="checkbox"
          className="size-5 accent-blue-600"
          checked={enabled}
          disabled={locked}
          onChange={(e) => setEnabled(e.target.checked)}
        />
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        {[
          {
            label: "Tiempo que tarda en llegar (días)",
            value: lead,
            set: setLead,
            min: 1,
            max: 364,
            help: "Desde que hacés el pedido al proveedor.",
          },
          {
            label: "Margen de seguridad (días)",
            value: safety,
            set: setSafety,
            min: 0,
            max: 364,
            help: "Tiempo extra para resolver demoras.",
          },
        ].map((field) => (
          <label
            key={field.label}
            className="grid content-start gap-2 text-sm font-medium"
          >
            {field.label}
            <Input
              className="min-h-12"
              type="number"
              inputMode="numeric"
              step={1}
              min={field.min}
              max={field.max}
              required
              value={field.value}
              disabled={locked}
              onChange={(e) => field.set(e.target.value)}
            />
            <span className="text-xs leading-relaxed font-normal text-muted-foreground">
              {field.help}
            </span>
          </label>
        ))}
      </div>
      <div
        className="space-y-2 rounded-r-lg border-l-4 border-blue-600 bg-blue-50 px-4 py-4"
        role="status"
      >
        <p className="text-sm font-semibold">
          Te avisamos cuando quede stock para{" "}
          {Number(lead || 0) + Number(safety || 0)} días
        </p>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {lead || 0} días de entrega + {safety || 0} días de margen. Se aplica
          a este insumo en la sucursal seleccionada.
        </p>
      </div>
      <details open className="border-y border-line py-4">
        <summary className="min-h-8 cursor-pointer text-sm font-semibold text-blue-700">
          Cantidad a comprar
        </summary>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          <label className="grid content-start gap-2 text-sm font-medium">
            Consumo diario estimado (
            {item?.baseUnit === "unit"
              ? "unid."
              : (item?.baseUnit ?? "unidad base")}
            )
            <Input
              className="min-h-12"
              inputMode="decimal"
              value={daily}
              disabled={locked}
              onChange={(e) => setDaily(e.target.value)}
              placeholder="Usá coma para decimales"
            />
          </label>
          <label className="grid content-start gap-2 text-sm font-medium">
            Reponer para cubrir (días)
            <Input
              className="min-h-12"
              type="number"
              inputMode="numeric"
              min={1}
              max={365}
              step={1}
              required
              disabled={locked}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </label>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
          Usá la unidad base del insumo. Vacío significa que falta estimar; cero
          confirma que no se prevé consumo. Es una estimación manual, no un
          promedio de ventas.
        </p>
      </details>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" className="min-h-14" disabled={locked}>
          Guardar configuración
        </Button>
        <Button
          type="button"
          className="min-h-12"
          variant="outline"
          disabled={locked}
          onClick={onCancel}
        >
          Cancelar
        </Button>
      </div>
    </form>
  );
}
