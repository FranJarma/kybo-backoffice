"use client";

import { createContext, useContext, useId, type ReactNode } from "react";
import { Dialog as Primitive } from "radix-ui";
import { X } from "lucide-react";
import { SearchCombobox } from "@/components/ui/search-combobox";
import { FieldCaption } from "@/components/ui/field-caption";
import type { AttendanceSnapshot } from "@/modules/attendance/queries";
import type { AttendanceCommand } from "@/modules/attendance/validation";
export type Snapshot = AttendanceSnapshot;
export const AttendanceErrorContext = createContext("");
export type Command = (
  command: AttendanceCommand,
) => Promise<{ id: string; [key: string]: unknown }>;
export const kindLabel = {
  entry: "Entrada",
  pause: "Inicio de pausa",
  resume: "Fin de pausa",
  exit: "Salida",
};
export function clock(value: string | null | undefined, zone: string) {
  return value
    ? new Intl.DateTimeFormat("es-AR", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: zone,
        hourCycle: "h23",
      }).format(new Date(value))
    : "—";
}
export function dateLabel(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(value.slice(0, 10) + "T12:00:00Z"));
}
export function minutes(value = 0) {
  const n = Math.max(0, Math.floor(value));
  return `${Math.floor(n / 60)} h ${String(n % 60).padStart(2, "0")} min`;
}
export function nameOf(data: Snapshot, id: string | null) {
  return (
    data.people.find((p) => p.id === id)?.name ??
    (id === data.actor.id ? data.actor.name : "Usuario autorizado")
  );
}
export function Badge({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: "muted" | "green" | "orange" | "blue";
}) {
  return <span className={`att-badge ${tone}`}>{children}</span>;
}
export function Drawer({
  title,
  description,
  children,
  onClose,
  busy = false,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
}) {
  const error = useContext(AttendanceErrorContext);
  return (
    <Primitive.Root
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <Primitive.Portal>
        <Primitive.Overlay className="att-overlay" />
        <Primitive.Content
          className="att-drawer"
          onEscapeKeyDown={(e) => {
            if (busy) e.preventDefault();
          }}
          onPointerDownOutside={(e) => {
            if (busy) e.preventDefault();
          }}
        >
          <header>
            <div>
              <Primitive.Title>{title}</Primitive.Title>
              <Primitive.Description>{description}</Primitive.Description>
            </div>
            <Primitive.Close
              disabled={busy}
              aria-label="Cerrar detalle"
              className="att-icon-button"
            >
              <X size={20} />
            </Primitive.Close>
          </header>
          <div className="att-drawer-body">
            {error && (
              <p role="alert" className="att-error">
                {error}
              </p>
            )}
            {children}
          </div>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  );
}
export function Relation({
  label,
  options,
  value,
  onChange,
  required,
  disabled,
}: {
  label: string;
  options: { id: string; name: string; description?: string }[];
  value: string;
  onChange: (id: string) => void;
  required?: boolean;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="att-field">
      <label htmlFor={id}>
        <FieldCaption required={required} optional={!required}>
          {label}
        </FieldCaption>
      </label>
      <SearchCombobox
        id={id}
        label={label}
        options={options}
        value={value}
        selectedLabel={options.find((o) => o.id === value)?.name ?? ""}
        onChange={onChange}
        onSearch={() => {}}
        required={required}
        disabled={disabled}
        inputClassName="min-h-11"
      />
    </div>
  );
}
export function Field({
  label,
  required,
  children,
  hint,
}: {
  label: string;
  required?: boolean;
  children: ReactNode;
  hint?: string;
}) {
  const id = useId();
  // A wrapping label keeps the control associated without requiring callers to manufacture ids.
  return (
    <div className="att-field">
      <label>
        <FieldCaption required={required} optional={!required}>
          {label}
        </FieldCaption>
        {children}
      </label>
      {hint && <small id={id}>{hint}</small>}
    </div>
  );
}
