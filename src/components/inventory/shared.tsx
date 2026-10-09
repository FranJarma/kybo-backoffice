"use client";
import { useCallback, useEffect, useId, useState } from "react";
import type { CatalogRow, Entity, ListResult } from "@/modules/catalog/types";

export const today = (timeZone = "America/Argentina/Buenos_Aires") =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
export function quantity(value: string, unit?: string) {
  return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 6 }).format(Number(value))}${unit ? ` ${unit === "unit" ? "unid." : unit}` : ""}`;
}
export function money(value: string | null, decimals: 2 | 6 = 2) {
  return value === null
    ? "Pendiente"
    : new Intl.NumberFormat("es-AR", {
        style: "currency",
        currency: "ARS",
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      }).format(Number(value));
}
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
  kind === "reservation"
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
  const [error, setError] = useState("");
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
  }, [storageKey, kind]);
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
    [kind, onSuccess, storageKey, branchId],
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
  const [searchAvailable, setSearchAvailable] = useState(false);
  const [items, setItems] = useState<CatalogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
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
              setSearchAvailable((shown) => shown || data.total > 8);
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
  }, [entity, search, label, itemScope]);
  const options = [
    ...(cached ? [cached] : []),
    ...items.filter((r) => !cached || r.id !== cached.id),
  ].filter((row) => !filter || filter(row) || row.id === value);
  return (
    <div className="min-w-0">
      <label
        htmlFor={selectId}
        className="mb-2 block text-xs font-semibold text-brand"
      >
        {label}
        {required ? " *" : ""}
      </label>
      <select
        id={selectId}
        className="form-control"
        aria-label={label}
        value={value}
        disabled={disabled || (loading && !options.length)}
        required={required}
        onChange={(event) => {
          const row = options.find((item) => item.id === event.target.value);
          setCached(row);
          onChange(event.target.value, row);
        }}
      >
        <option value="">
          {loading ? "Cargando…" : `Elegí ${label.toLowerCase()}`}
        </option>
        {options.map((row) => (
          <option key={row.id} value={row.id}>
            {row.name}
          </option>
        ))}
      </select>
      {(searchAvailable || search) && (
        <input
          className="form-control mt-2"
          type="search"
          value={search}
          disabled={disabled}
          onChange={(event) => setSearch(event.target.value)}
          placeholder={`Buscar entre ${total} opciones…`}
          aria-label={`Buscar ${label.toLowerCase()}`}
        />
      )}
      {total > 100 && (
        <p className="mt-1 text-xs text-muted">
          Hay {total} coincidencias. Escribí para encontrar más opciones.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
import { useEffect as importUseEffect } from "react";
