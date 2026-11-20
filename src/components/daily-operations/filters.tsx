"use client";
import { Button } from "@/components/ui/button";
import { SearchCombobox } from "@/components/ui/search-combobox";
import type { Urgency } from "@/modules/daily-operations/types";
export type DayFilters = {
  mine: boolean;
  locationId: string;
  assignedTo: string;
  kind: string;
  urgency: Urgency | "";
};
const control =
  "min-h-12 w-full min-w-0 rounded-lg border border-line bg-white px-3 text-sm";
export function DayFiltersBar({
  value,
  onChange,
  onReset,
  canManage,
  stock,
  people,
  locations,
  active,
}: {
  value: DayFilters;
  onChange: (patch: Partial<DayFilters>) => void;
  onReset: () => void;
  canManage: boolean;
  stock: boolean;
  people: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  active: boolean;
}) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 items-start gap-3 xl:grid-cols-4">
        {canManage && !stock && (
          <label className="grid gap-1.5 text-xs font-semibold text-muted">
            Ver tareas de
            <select
              aria-label="Vista de tareas"
              className={control}
              value={value.mine ? "mine" : "team"}
              onChange={(event) =>
                onChange({
                  mine: event.target.value === "mine",
                  assignedTo: "",
                })
              }
            >
              <option value="team">Todo el equipo</option>
              <option value="mine">Mis tareas</option>
            </select>
          </label>
        )}
        <label className="grid gap-1.5 text-xs font-semibold text-muted">
          Ubicación
          <select
            aria-label="Ubicación"
            className={control}
            value={value.locationId}
            onChange={(event) => onChange({ locationId: event.target.value })}
          >
            <option value="">Todas las ubicaciones</option>
            {locations.map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        </label>
        {!stock && (
          <label className="grid gap-1.5 text-xs font-semibold text-muted">
            Tipo de tarea
            <select
              aria-label="Tipo de tarea"
              className={control}
              value={value.kind}
              onChange={(event) => onChange({ kind: event.target.value })}
            >
              <option value="">Todas las tareas</option>
              <option value="transfer">Reposición</option>
              <option value="production">Preparación</option>
              <option value="purchase">Compras</option>
            </select>
          </label>
        )}
        {canManage && !value.mine && !stock && (
          <div className="min-w-0 space-y-1.5">
            <label
              htmlFor="daily-owner-filter"
              className="block text-xs font-semibold text-muted"
            >
              Responsable
            </label>
            <SearchCombobox
              id="daily-owner-filter"
              label="Responsable de la tarea"
              value={value.assignedTo}
              selectedLabel={
                value.assignedTo === "unassigned"
                  ? "Sin responsable"
                  : (people.find((person) => person.id === value.assignedTo)
                      ?.name ?? "")
              }
              options={[
                { id: "unassigned", name: "Sin responsable" },
                ...people,
              ]}
              placeholder="Todos los responsables"
              onSearch={() => {}}
              onChange={(assignedTo) => onChange({ assignedTo })}
              inputClassName="min-h-12 bg-white"
            />
          </div>
        )}
      </div>
      {active && (
        <Button
          type="button"
          variant="ghost"
          className="text-blue"
          onClick={onReset}
        >
          Limpiar filtros
        </Button>
      )}
    </div>
  );
}
