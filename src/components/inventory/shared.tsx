"use client";
import { useCallback, useEffect, useId, useState } from "react";
import type { CatalogRow, Entity, ListResult } from "@/modules/catalog/types";
import { SearchCombobox } from "@/components/ui/search-combobox";
import { FieldCaption } from "@/components/ui/field-caption";
import { OperationAlert } from "@/components/ui/operation-alert";
import { useErrorFeedback } from "@/components/ui/use-error-feedback";

export const today = (timeZone = "America/Argentina/Buenos_Aires") =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export { quantity, money } from "@/lib/number-format";
export function date(value: string) {
  const [year, month, day] = value.slice(0, 10).split("-");
  return `${day}/${month}/${year}`;
}
export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: branchHeaders(),
  });
  if (!response.ok) throw new Error(await errorText(response));
  return response.json() as Promise<T>;
}
async function errorText(response: Response) {
  try {
    const body = (await response.json()) as { error?: string };
    return (
      body.error || `No pudimos completar la operación (${response.status}).`
    );
  } catch {
    return `No pudimos completar la operación (${response.status}).`;
  }
}

type Pending<T> = { url: string; payload: T };
function currentBranchId() {
  return typeof document === "undefined"
    ? ""
    : (document.cookie
        .split("; ")
        .find((c) => c.startsWith("kybo-branch="))
        ?.split("=")[1] ?? "");
}
function branchHeaders(): Record<string, string> {
  const branchId = currentBranchId();
  return branchId ? { "X-Kybo-Branch-Id": branchId } : {};
}
type OperationKind =
  | "replenishment"
  | "item-sourcing"
  | "reservation"
  | "recall"
  | "transfer"
  | "internal-use"
  | "fulfillment"
  | "stock-resolution"
  | "production-order"
  | "receipt"
  | "payment"
  | "adjustment"
  | "recipe"
  | "production"
  | "sale"
  | "preparation"
  | "preparation-settings"
  | "table";
const urlFor = (kind: OperationKind, url: string) =>
  kind === "replenishment"
    ? url === "/api/inventory/replenishment"
    : kind === "item-sourcing"
      ? /^\/api\/items\/[0-9a-f-]{36}\/suppliers$/.test(url)
      : kind === "reservation"
        ? url === "/api/inventory/reservations"
        : kind === "recall"
          ? url === "/api/inventory/recalls"
          : kind === "production-order"
            ? url === "/api/production/orders" ||
              /^\/api\/production\/orders\/[0-9a-f-]{36}$/.test(url)
            : kind === "transfer"
              ? url === "/api/transfers" ||
                /^\/api\/transfers\/[0-9a-f-]{36}\/(dispatch|receive|resolve|cancel)$/.test(
                  url,
                )
              : kind === "internal-use"
                ? url === "/api/inventory/internal-use"
                : kind === "fulfillment"
                  ? /^\/api\/fulfillment\/(complete|deliver|return)$/.test(url)
                  : kind === "stock-resolution"
                    ? /^\/api\/stock-resolutions\/[0-9a-f-]{36}$/.test(url)
                    : kind === "preparation"
                      ? /^\/api\/preparation\/[0-9a-f-]{36}$/.test(url)
                      : kind === "preparation-settings"
                        ? /^\/api\/preparation\/settings\/(stations|routes)$/.test(
                            url,
                          )
                        : kind === "sale"
                          ? url === "/api/sales" ||
                            /^\/api\/sales\/[0-9a-f-]{36}\/(orders|payments|cancel)$/.test(
                              url,
                            )
                          : kind === "table"
                            ? url === "/api/sales/tables"
                            : kind === "recipe"
                              ? url === "/api/recipes"
                              : kind === "production"
                                ? url === "/api/production"
                                : kind === "receipt"
                                  ? url === "/api/purchases"
                                  : kind === "adjustment"
                                    ? url === "/api/inventory/adjustments"
                                    : /^\/api\/purchases\/[0-9a-f-]{36}\/payments$/.test(
                                        url,
                                      );
function validPending<T>(
  kind: OperationKind,
  value: unknown,
): value is Pending<T> {
  if (typeof value !== "object" || value === null) return false;
  const item = value as { url?: unknown; payload?: { requestId?: unknown } };
  return (
    typeof item.url === "string" &&
    urlFor(kind, item.url) &&
    typeof item.payload === "object" &&
    item.payload !== null &&
    typeof item.payload.requestId === "string" &&
    /^[0-9a-f-]{36}$/.test(item.payload.requestId)
  );
}
export function useOperation<T>(
  actorId: string,
  kind: OperationKind,
  onSuccess: (result: unknown) => void,
) {
  const branchId = currentBranchId();
  const storageKey = `kybo:pending:${actorId}:${branchId}:${kind}`;
  const [pending, setPending] = useState<Pending<T> | null>(null);
  const [uncertain, setUncertain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError, errorAttempt] = useErrorFeedback();
  const [status, setStatus] = useState<number | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = sessionStorage.getItem(storageKey);
        if (saved) {
          const value: unknown = JSON.parse(saved);
          if (!validPending<T>(kind, value)) {
            sessionStorage.removeItem(storageKey);
            setError(
              "Se descartó una operación local inválida. Revisá el registro antes de cargar una nueva.",
            );
          } else {
            setPending(value);
            setUncertain(true);
            setError(
              "Hay un envío pendiente de confirmar. Reintentá la misma operación antes de registrar otra.",
            );
          }
        }
        setReady(true);
      } catch {
        setError(
          "No pudimos acceder al almacenamiento de esta pestaña. No se enviará ninguna operación.",
        );
        setReady(false);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [storageKey, kind, setError]);
  const send = useCallback(
    async (operation: Pending<T>) => {
      if (!validPending<T>(kind, operation)) {
        setError(
          "No se puede reintentar esta operación porque el destino es inválido.",
        );
        return;
      }
      setBusy(true);
      setError("");
      setStatus(null);
      let response: Response;
      try {
        response = await fetch(operation.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(branchId ? { "X-Kybo-Branch-Id": branchId } : {}),
          },
          body: JSON.stringify(operation.payload),
        });
      } catch {
        setPending(operation);
        setUncertain(true);
        setError(
          "No pudimos confirmar el resultado. Reintentá el mismo envío; no vuelvas a cargar la operación.",
        );
        setBusy(false);
        return;
      }
      if (!response.ok) {
        const message = await errorText(response);
        setStatus(response.status);
        if (
          response.status >= 400 &&
          response.status < 500 &&
          ![401, 403, 429].includes(response.status)
        ) {
          try {
            sessionStorage.removeItem(storageKey);
          } catch {
            setError(
              "No pudimos limpiar la operación local. Recargá antes de una nueva carga.",
            );
            setBusy(false);
            return;
          }
          setPending(null);
          setUncertain(false);
        } else {
          setPending(operation);
          setUncertain(true);
        }
        setError(message);
        setBusy(false);
        return;
      }
      let result: unknown;
      try {
        result = await response.json();
        sessionStorage.removeItem(storageKey);
      } catch {
        setPending(operation);
        setUncertain(true);
        setError(
          "El servidor respondió, pero no pudimos confirmar el resultado. Reintentá el mismo envío.",
        );
        setBusy(false);
        return;
      }
      setPending(null);
      setUncertain(false);
      setStatus(null);
      setBusy(false);
      onSuccess(result);
    },
    [kind, onSuccess, storageKey, branchId, setError],
  );
  const submit = (url: string, payload: T) => {
    if (!ready || pending || busy || !urlFor(kind, url)) return;
    const operation = { url, payload };
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(operation));
    } catch {
      setError(
        "No pudimos asegurar el reintento en esta pestaña. No se envió la operación.",
      );
      return;
    }
    setPending(operation);
    void send(operation);
  };
  return {
    submit,
    retry: () => pending && !busy && void send(pending),
    busy,
    ready,
    error,
    errorAttempt,
    status,
    uncertain,
    locked: !ready || uncertain || busy,
    clearError: () => setError(""),
  };
}

export function SearchSelect({
  entity,
  itemScope = "",
  label,
  value,
  onChange,
  filter,
  disabled,
  required,
  initial,
}: {
  entity: Entity;
  itemScope?: "" | "ingredients" | "recipe";
  label: string;
  value: string;
  onChange: (id: string, row?: CatalogRow) => void;
  filter?: (row: CatalogRow) => boolean;
  disabled?: boolean;
  required?: boolean;
  initial?: CatalogRow;
}) {
  const selectId = useId();
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<CatalogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError, errorAttempt] = useErrorFeedback();
  const [cached, setCached] = useState<CatalogRow | undefined>(initial);
  const [loading, setLoading] = useState(true);
  // The catalog API exposes the first 100 matches and the full count. Search narrows beyond that page.
  importUseEffect(() => {
    let live = true;
    const timer = setTimeout(
      () => {
        setLoading(true);
        getJson<ListResult>(
          `/api/catalog/${entity}?archived=0&itemScope=${itemScope}&q=${encodeURIComponent(search)}`,
        )
          .then((data) => {
            if (live) {
              setItems(data.rows);
              setTotal(data.total);
              setError("");
            }
          })
          .catch(() => {
            if (live) setError(`No pudimos cargar ${label.toLowerCase()}.`);
          })
          .finally(() => {
            if (live) setLoading(false);
          });
      },
      search ? 250 : 0,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [entity, search, label, itemScope, setError]);
  const options = [
    ...(initial?.id === value ? [initial] : []),
    ...(cached && cached.id !== initial?.id ? [cached] : []),
    ...items.filter(
      (r) =>
        r.id !== cached?.id && !(initial?.id === value && r.id === initial.id),
    ),
  ].filter((row) => !filter || filter(row) || row.id === value);
  return (
    <div className="min-w-0">
      <label
        htmlFor={selectId}
        className="mb-2 block text-xs font-semibold text-brand"
      >
        <FieldCaption required={required}>{label}</FieldCaption>
      </label>
      <SearchCombobox
        id={selectId}
        label={label}
        value={value}
        selectedLabel={
          value
            ? String(
                options.find((row) => row.id === value)?.name ??
                  "Selección actual",
              )
            : ""
        }
        options={options.map((row) => ({ id: row.id, name: String(row.name) }))}
        disabled={disabled}
        loading={loading}
        required={required}
        onSearch={setSearch}
        onChange={(id) => {
          const row = options.find((item) => item.id === id);
          setCached(row);
          onChange(id, row);
        }}
      />
      {total > 100 && (
        <p className="mt-1 text-xs text-muted">
          Hay {total} coincidencias. Escribí para encontrar más opciones.
        </p>
      )}
      <OperationAlert
        title="No pudimos cargar las opciones"
        message={error}
        eventKey={errorAttempt}
        tone="error"
      />
    </div>
  );
}
import { useEffect as importUseEffect } from "react";
