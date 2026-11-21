"use client";
import {
  canDiscardRejectedOperation,
  discardRejectedOperation,
} from "./operation-recovery";
import { useCallback, useEffect, useId, useRef, useState } from "react";
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
export async function getJson<T>(
  url: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(url, {
    cache: "no-store",
    headers: branchHeaders(),
    signal,
  });
  if (!response.ok) throw new Error(await errorText(response));
  return response.json() as Promise<T>;
}
async function errorText(response: Response) {
  return (await errorDetails(response)).message;
}
async function errorDetails(response: Response) {
  const fallback = `No pudimos completar la operación (${response.status}).`;
  try {
    const body = await response.json();
    return {
      message:
        typeof body?.error === "string" && body.error ? body.error : fallback,
      code: typeof body?.code === "string" ? body.code : null,
    };
  } catch {
    return { message: fallback, code: null };
  }
}

type Pending<T> = { url: string; payload: T; outcomeUncertain?: boolean };
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
  | "cash"
  | "purchase-advance"
  | "purchase-orders"
  | "supply-alerts"
  | "transfer-batch"
  | "pickup"
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
  kind === "cash"
    ? url === "/api/cash"
    : kind === "purchase-advance"
      ? /^\/api\/procurement\/orders\/[0-9a-f-]{36}\/advances$/.test(url)
      : kind === "purchase-orders"
        ? url === "/api/procurement/orders" ||
          /^\/api\/procurement\/orders\/[0-9a-f-]{36}$/.test(url)
        : kind === "supply-alerts"
          ? url === "/api/inventory/supply-alerts"
          : kind === "transfer-batch"
            ? url === "/api/transfers/batch"
            : kind === "pickup"
              ? /^\/api\/pickup\/orders\/[0-9a-f-]{36}$/.test(url)
              : kind === "replenishment"
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
                              ? /^\/api\/fulfillment\/(complete|deliver|return)$/.test(
                                  url,
                                )
                              : kind === "stock-resolution"
                                ? /^\/api\/stock-resolutions\/[0-9a-f-]{36}$/.test(
                                    url,
                                  )
                                : kind === "preparation"
                                  ? /^\/api\/preparation\/[0-9a-f-]{36}$/.test(
                                      url,
                                    )
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
                                                ? url ===
                                                  "/api/inventory/adjustments"
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
  onSuccess: (result: unknown, operation: Pending<T>) => void,
  explicitBranchId?: string,
  validateResult?: (result: unknown, operation: Pending<T>) => boolean,
) {
  const branchId = explicitBranchId ?? currentBranchId();
  const sending = useRef(false);
  const storageKey = `kybo:pending:${actorId}:${branchId}:${kind}`;
  const [snapshot, setSnapshot] = useState<{
    storageKey: string;
    pending: Pending<T> | null;
  } | null>(null);
  const currentSnapshot = useRef(snapshot);
  const ready = snapshot?.storageKey === storageKey;
  const pending = ready ? snapshot.pending : null;
  // A retained callback belongs to one pending request (or one empty register).
  // Advance both identities together, before a future render can expose its actions.
  const setPending = useCallback(
    (pending: Pending<T> | null) => {
      const next = { storageKey, pending };
      currentSnapshot.current = next;
      setSnapshot(next);
    },
    [storageKey],
  );
  const [uncertain, setUncertain] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError, errorAttempt] = useErrorFeedback();
  const [status, setStatus] = useState<number | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const saved = sessionStorage.getItem(storageKey);
        let restored: Pending<T> | null = null;
        if (saved) {
          const value: unknown = JSON.parse(saved);
          if (!validPending<T>(kind, value)) {
            sessionStorage.removeItem(storageKey);
            setError(
              "Se descartó una operación local inválida. Revisá el registro antes de cargar una nueva.",
            );
          } else {
            restored = value;
            setError(
              "Hay un envío pendiente de confirmar. Reintentá la misma operación antes de registrar otra.",
            );
          }
        }
        setPending(restored);
        setUncertain(!!restored);
        setStatus(null);
        setErrorCode(null);
      } catch {
        setError(
          "No pudimos acceder al almacenamiento de esta pestaña. No se enviará ninguna operación.",
        );
        currentSnapshot.current = null;
        setSnapshot(null);
      }
    }, 0);
    return () => {
      clearTimeout(timer);
      currentSnapshot.current = null;
    };
  }, [storageKey, kind, setError, setPending]);
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
      setErrorCode(null);
      let payload = operation.payload;
      const data = payload as Record<string, unknown>;
      const cashClose =
        kind === "cash" &&
        (data.command as { action?: string })?.action === "close";
      const productionStart = kind === "production-order" && "start" in data;
      if (cashClose || productionStart) {
        try {
          const { operationConfirmation } =
            await import("@/components/identity/client");
          const id = productionStart
            ? operation.url.split("/").at(-1)!
            : undefined;
          const binding = cashClose
            ? data.command
            : { id, requestId: data.requestId, start: data.start };
          const verificationId = await operationConfirmation(
            cashClose ? "cash-close" : "production-start",
            String(data.requestId),
            binding,
            branchId,
          );
          payload = {
            ...data,
            ...(verificationId ? { verificationId } : {}),
          } as T;
        } catch (error) {
          if (!uncertain) {
            sessionStorage.removeItem(storageKey);
            setPending(null);
          }
          setError(
            (error as Error).message +
              (uncertain
                ? " El envío anterior sigue pendiente de confirmar."
                : " No se envió la operación."),
          );
          setBusy(false);
          return;
        }
      }
      let response: Response;
      const inFlight = { ...operation, outcomeUncertain: true };
      try {
        // Persist uncertainty before dispatch: a closed tab or lost response
        // must never turn a potentially committed command into a safe discard.
        sessionStorage.setItem(storageKey, JSON.stringify(inFlight));
        response = await fetch(operation.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(branchId ? { "X-Kybo-Branch-Id": branchId } : {}),
          },
          body: JSON.stringify(payload),
        });
      } catch {
        setPending(inFlight);
        setUncertain(true);
        setError(
          "No pudimos confirmar el resultado. Reintentá el mismo envío; no vuelvas a cargar la operación.",
        );
        setBusy(false);
        return;
      }
      if (!response.ok) {
        const { message, code } = await errorDetails(response);
        setErrorCode(code);
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
          const preserved = {
            ...operation,
            outcomeUncertain:
              operation.outcomeUncertain !== false ||
              ![401, 403].includes(response.status),
          };
          try {
            sessionStorage.setItem(storageKey, JSON.stringify(preserved));
          } catch {
            preserved.outcomeUncertain = true;
          }
          setPending(preserved);
          setUncertain(true);
        }
        setError(message);
        setBusy(false);
        return;
      }
      let result: unknown;
      try {
        result = await response.json();
        if (validateResult && !validateResult(result, operation))
          throw Error("La respuesta no confirma la operación.");
        if (
          kind === "cash" &&
          (!result ||
            typeof result !== "object" ||
            !("branchId" in result) ||
            result.branchId !== branchId ||
            !("totals" in result) ||
            !("capabilities" in result))
        )
          throw Error("La respuesta no confirma la operación de Caja.");
        sessionStorage.removeItem(storageKey);
      } catch {
        setPending(inFlight);
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
      setErrorCode(null);
      setBusy(false);
      onSuccess(result, operation);
    },
    [
      kind,
      onSuccess,
      storageKey,
      branchId,
      setError,
      uncertain,
      validateResult,
      setPending,
    ],
  );
  const submit = (url: string, payload: T) => {
    if (
      !ready ||
      currentSnapshot.current !== snapshot ||
      pending ||
      busy ||
      sending.current ||
      !urlFor(kind, url)
    )
      return false;
    sending.current = true;
    const operation = { url, payload, outcomeUncertain: false };
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(operation));
    } catch {
      setError(
        "No pudimos asegurar el reintento en esta pestaña. No se envió la operación.",
      );
      sending.current = false;
      return false;
    }
    setPending(operation);
    void send(operation).finally(() => {
      sending.current = false;
    });
    return true;
  };
  return {
    submit,
    retry: () => {
      if (
        !pending ||
        currentSnapshot.current !== snapshot ||
        busy ||
        sending.current
      )
        return;
      sending.current = true;
      setPending(pending);
      void send(pending).finally(() => {
        sending.current = false;
      });
    },
    canDiscard: canDiscardRejectedOperation({
      pending: !!pending,
      busy,
      status,
      outcomeUncertain: pending?.outcomeUncertain,
    }),
    discardRejected: () => {
      if (currentSnapshot.current !== snapshot || sending.current) return false;
      try {
        if (
          !discardRejectedOperation(sessionStorage, storageKey, {
            pending: !!pending,
            busy,
            status,
            outcomeUncertain: pending?.outcomeUncertain,
          })
        )
          return false;
      } catch {
        setError(
          "No pudimos descartar el envío guardado. Recargá antes de continuar.",
        );
        return false;
      }
      setPending(null);
      setUncertain(false);
      setStatus(null);
      setErrorCode(null);
      setError("");
      return true;
    },
    busy,
    ready,
    error,
    errorAttempt,
    errorCode,
    status,
    uncertain,
    pending,
    locked: !ready || uncertain || busy,
    clearError: () => {
      setError("");
      setErrorCode(null);
    },
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
  requiredCaption = required,
  optional = !requiredCaption,
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
  requiredCaption?: boolean;
  optional?: boolean;
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
        <FieldCaption
          required={!disabled && requiredCaption}
          optional={!disabled && optional}
        >
          {label}
        </FieldCaption>
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
