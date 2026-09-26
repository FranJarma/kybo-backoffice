"use client";
import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Info } from "lucide-react";
import {
  decimal,
  exactDivision,
  integer,
  safeQuantity,
  SCALE,
} from "@/modules/inventory/decimal";
export const unitLabel = (unit: string) => (unit === "unit" ? "unid." : unit);
export const inputDecimal = (value: string) =>
  value
    .replace(".", ",")
    .replace(/,?0+$/, (match) => (match.startsWith(",") ? "" : match))
    .replace(/(,\d*?)0+$/, "$1");
export function scaledQuantity(quantity: string, multiplier: string) {
  return safeQuantity(
    exactDivision(
      integer(quantity) * integer(decimal(multiplier, 6, true, true)!),
      SCALE,
    ),
  );
}
export function Field({
  label,
  value,
  onChange,
  unit,
  type = "text",
  disabled,
  required,
  hint,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  unit?: string;
  type?: string;
  disabled?: boolean;
  required?: boolean;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <label
        htmlFor={id}
        className="mb-2 block text-xs font-semibold text-brand"
      >
        {label}
        {required ? " *" : ""}
      </label>
      <div className="relative">
        <Input
          id={id}
          aria-label={label}
          aria-describedby={hint ? `${id}-hint` : undefined}
          type={type}
          inputMode={type === "text" && unit ? "decimal" : undefined}
          value={value}
          disabled={disabled}
          readOnly={!onChange}
          required={required}
          onChange={(e) => onChange?.(e.target.value)}
          className={unit ? "pr-16 tabular-nums" : undefined}
        />
        {unit && (
          <span
            className="pointer-events-none absolute inset-y-px right-px flex w-14 items-center justify-center rounded-r-lg border-l border-line bg-surface text-xs text-muted"
            aria-hidden="true"
          >
            {unitLabel(unit)}
          </span>
        )}
      </div>
      {hint && (
        <p id={`${id}-hint`} className="mt-1.5 text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}
export function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl bg-blue-50 p-4 text-sm text-blue-800">
      <Info size={18} className="mt-0.5 shrink-0" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
export function SummaryLine({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: React.ReactNode;
  strong?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-5 border-b border-line py-3.5 last:border-0">
      <dt className="text-sm text-muted">{label}</dt>
      <dd
        className={`text-right text-sm tabular-nums ${strong ? "font-bold text-brand" : "font-semibold"}`}
      >
        {value}
      </dd>
    </div>
  );
}
