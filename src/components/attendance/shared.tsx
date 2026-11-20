"use client";

import {
  createContext,
  useContext,
  useId,
  useRef,
  type ReactNode,
} from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { X } from "lucide-react";
import { SearchCombobox } from "@/components/ui/search-combobox";
import { FieldCaption } from "@/components/ui/field-caption";
import type { AttendanceSnapshot } from "@/modules/attendance/queries";
import type { AttendanceCommand } from "@/modules/attendance/validation";
export type Snapshot = AttendanceSnapshot;
export const AttendanceErrorContext = createContext("");
export const AttendanceReadOnlyContext = createContext(false);
const AttendanceBusyContext = createContext(false);
export type Command = (
  command: AttendanceCommand,
) => Promise<{ id: string; [key: string]: unknown }>;
export const kindLabel = {
  entry: "Entrada",
  pause: "Inicio de pausa",
  resume: "Fin de pausa",
  exit: "Salida",
};
export function attendanceOrigin(event: {
  source: string;
  locationVerified?: boolean;
}) {
  if (event.source === "manual") return "Manual autorizado";
  return event.locationVerified === false
    ? "Identidad verificada · Sin validación de ubicación"
    : "Identidad y ubicación verificadas";
}
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
  className,
  footer,
}: {
  title: string;
  description: string;
  children: ReactNode;
  onClose: () => void;
  busy?: boolean;
  className?: string;
  footer?: ReactNode;
}) {
  const error = useContext(AttendanceErrorContext);
  const readOnly = useContext(AttendanceReadOnlyContext);
  const content = useRef<HTMLDivElement>(null);
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent
        ref={content}
        showCloseButton={false}
        style={{ borderRadius: 0 }}
        className={`att-drawer inset-y-0 right-0 left-auto h-dvh max-h-dvh max-w-full sm:max-w-none translate-x-0 translate-y-0 gap-0 overflow-hidden rounded-none border-0 p-0 data-[state=open]:animate-none data-[state=closed]:animate-none${className ? ` ${className}` : ""}`}
        onOpenAutoFocus={(event) => {
          const first = content.current?.querySelector<HTMLElement>(
            '.att-drawer-body input:not([type="hidden"]):not([type="checkbox"]):not(:disabled), .att-drawer-body select:not(:disabled), .att-drawer-body textarea:not(:disabled)',
          );
          if (first) {
            event.preventDefault();
            first.focus();
          }
        }}
        onCloseAutoFocus={(event) => {
          if (!readOnly) return;
          const retry = document.querySelector<HTMLButtonElement>(
            ".att-read-feedback button:not(:disabled)",
          );
          if (retry) {
            event.preventDefault();
            retry.focus({ preventScroll: true });
          }
        }}
        onEscapeKeyDown={(e) => {
          if (
            busy ||
            (e.target instanceof HTMLElement &&
              e.target.matches('[role="combobox"][aria-expanded="true"]'))
          )
            e.preventDefault();
        }}
        onPointerDownOutside={(e) => {
          if (busy) e.preventDefault();
        }}
      >
        <header>
          <div>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
            {busy && (
              <p role="status" className="att-drawer-progress">
                Guardando cambios…
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="Cerrar detalle"
            className="att-icon-button"
          >
            <X size={20} />
          </button>
        </header>
        <fieldset className="att-drawer-body" disabled={busy || readOnly}>
          {error && (
            <p role="alert" className="att-error">
              {error}
            </p>
          )}
          <AttendanceBusyContext value={busy}>{children}</AttendanceBusyContext>
        </fieldset>
        {footer && (
          <fieldset disabled={busy} className="att-drawer-footer">
            {footer}
          </fieldset>
        )}
      </DialogContent>
    </Dialog>
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
  const busy = useContext(AttendanceBusyContext);
  const readOnly = useContext(AttendanceReadOnlyContext);
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
        disabled={disabled || busy || readOnly}
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
