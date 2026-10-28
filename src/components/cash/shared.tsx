import type { ReactNode, Ref } from "react";
import { CircleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { FieldCaption } from "@/components/ui/field-caption";
import { money } from "@/lib/number-format";
import type { CashSession } from "@/modules/cash/types";

export function CashNotice({
  children,
  error = false,
}: {
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`cash-notice ${error ? "cash-notice-error" : ""}`}
      role={error ? "alert" : "status"}
    >
      <CircleAlert size={19} aria-hidden="true" />
      <div>{children}</div>
    </div>
  );
}
export function MoneyField({
  label,
  value,
  onChange,
  hint,
  inputRef,
  descriptionId,
  disabled = false,
  required = false,
  optional = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  inputRef?: Ref<HTMLInputElement>;
  descriptionId?: string;
  disabled?: boolean;
  required?: boolean;
  optional?: boolean;
}) {
  return (
    <label className="cash-field">
      <FieldCaption required={required} optional={optional}>
        {label}
      </FieldCaption>
      <div className="cash-money-input">
        <span aria-hidden="true">$</span>
        <Input
          ref={inputRef}
          aria-label={label}
          required={required}
          aria-required={required || undefined}
          aria-describedby={descriptionId}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0,00"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
        />
      </div>
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}
export function MoneyRow({
  label,
  amount,
  strong = false,
}: {
  label: string;
  amount: string | null;
  strong?: boolean;
}) {
  return (
    <div className={`cash-money-row ${strong ? "cash-money-row-strong" : ""}`}>
      <span>{label}</span>
      <b>{money(amount)}</b>
    </div>
  );
}
export function sessionDate(session: CashSession) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "long",
    timeZone: "UTC",
  }).format(new Date(`${session.businessDate}T12:00:00Z`));
}
export function sessionTime(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("es-AR", {
    timeZone,
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}
export class CashRequestError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}
export async function cashRequest<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  const response = await fetch(url, { cache: "no-store", ...options });
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new CashRequestError(
      body?.error ?? "No pudimos completar la operación. Volvé a intentar.",
      response.status,
    );
  return body as T;
}
export async function cashBranchRequest<T>(
  branchId: string,
  url: string,
  options?: RequestInit,
): Promise<T> {
  const headers = new Headers(options?.headers);
  headers.set("X-Kybo-Branch-Id", branchId);
  const result = await cashRequest<T>(url, { ...options, headers });
  if (
    result &&
    typeof result === "object" &&
    "branchId" in result &&
    result.branchId !== branchId
  ) {
    throw new CashRequestError(
      "La respuesta corresponde a otra sucursal. Volvé a abrir Caja para revisar tu sucursal activa.",
      403,
    );
  }
  return result;
}
export function cashPhotoUrl(photoId: string, branchId: string) {
  return `/api/cash/photos/${encodeURIComponent(photoId)}?branchId=${encodeURIComponent(branchId)}`;
}
