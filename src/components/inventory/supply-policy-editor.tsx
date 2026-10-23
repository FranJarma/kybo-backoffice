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
}: {
  policy?: SupplyPolicy;
  snapshot: SupplySnapshot;
  locked: boolean;
  onSave: (input: SupplyInput) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [itemId, setItem] = useState(policy?.itemId ?? "");
  const [daily, setDaily] = useState(
    policy?.dailyConsumption?.replace(/\.?0+$/, "").replace(".", ",") ?? "",
  );
  const [lead, setLead] = useState(String(policy?.leadDays ?? 7));
  const [safety, setSafety] = useState(String(policy?.safetyDays ?? 3));
  const [target, setTarget] = useState(String(policy?.targetDays ?? 17));
  const [enabled, setEnabled] = useState(policy?.enabled ?? true);
  const [error, setError] = useState("");
  const item = snapshot.items.find((i) => i.id === itemId);
  return (
    <form
      className="space-y-5 rounded-xl border border-line bg-white p-4 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (
          !itemId ||
          (daily !== "" && !/^\d+(?:,\d{1,6})?$/.test(daily)) ||
          !/^\d+$/.test(lead) ||
          !/^\d+$/.test(safety) ||
          !/^\d+$/.test(target) ||
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
      <h2 className="text-lg font-semibold text-brand">
        {policy ? "Editar compra anticipada" : "Agregar insumo de Bolivia"}
      </h2>
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
      <label className="grid gap-2 text-sm font-medium">
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
      <p className="text-sm leading-relaxed text-muted-foreground">
        Usá la unidad base del insumo. Vacío significa que falta estimar; cero
        confirma que no se prevé consumo. Es una estimación manual, no un
        promedio de ventas.
      </p>
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          {
            label: "Plazo de llegada (días)",
            value: lead,
            set: setLead,
            min: 1,
            max: 364,
          },
          {
            label: "Margen de seguridad (días)",
            value: safety,
            set: setSafety,
            min: 0,
            max: 364,
          },
          {
            label: "Objetivo de cobertura (días)",
            value: target,
            set: setTarget,
            min: 1,
            max: 365,
          },
        ].map((field) => (
          <label key={field.label} className="grid gap-2 text-sm font-medium">
            {field.label}
            <Input
              type="number"
              className="min-h-12"
              inputMode="numeric"
              min={field.min}
              max={field.max}
              step={1}
              required
              disabled={locked}
              value={field.value}
              onChange={(e) => field.set(e.target.value)}
            />
          </label>
        ))}
      </div>
      <label className="flex min-h-12 items-center gap-3 text-sm">
        <input
          type="checkbox"
          className="size-5"
          checked={enabled}
          disabled={locked}
          onChange={(e) => setEnabled(e.target.checked)}
        />
        Avisos activados para este insumo
      </label>
      {error && (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" className="min-h-14" disabled={locked}>
          Guardar compra anticipada
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
