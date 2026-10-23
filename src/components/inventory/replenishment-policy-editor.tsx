"use client";
import { useId, useState } from "react";
import { FieldCaption } from "@/components/ui/field-caption";
import { OperationAlert } from "@/components/ui/operation-alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SearchCombobox } from "@/components/ui/search-combobox";
import type {
  ReplenishmentPolicy,
  ReplenishmentSnapshot,
} from "@/modules/replenishment/types";
const touch = "min-h-12";
const labelClass = "grid min-w-0 gap-2 text-sm font-medium text-brand";
export type RuleInput = {
  id?: string;
  revision?: number;
  itemId: string;
  locationId: string;
  minimumQuantity: string;
  targetQuantity: string;
  preparationMinutes: number | null;
  enabled: boolean;
};

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

export function ReplenishmentPolicyEditor({
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
