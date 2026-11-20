import { getJson } from "@/components/inventory/shared";
import type { SaleChannel, SaleLookup } from "@/modules/sales/types";

export type CatalogueState = {
  data: SaleLookup;
  loading: boolean;
  complete: boolean;
  error: string;
  errorAttempt: number;
};

export const emptyCatalogue = (): CatalogueState => ({
  data: { rows: [], total: 0 },
  loading: true,
  complete: false,
  error: "",
  errorAttempt: 0,
});

export function createCatalogueLoader({
  channel,
  onChange,
  onComplete,
}: {
  channel: SaleChannel;
  onChange: (state: CatalogueState) => void;
  onComplete?: (rows: SaleLookup["rows"]) => void;
}) {
  let disposed = false;
  let state = emptyCatalogue();
  let offset = 0;
  let first: SaleLookup | undefined;
  let request: AbortController | undefined;
  let requestTimeout: ReturnType<typeof setTimeout> | undefined;
  let running = false;

  async function load() {
    if (disposed || running || state.complete) return;
    running = true;
    state = { ...state, loading: true, error: "" };
    onChange(state);
    let restarts = 0;
    try {
      while (!disposed) {
        const controller = new AbortController();
        request = controller;
        requestTimeout = setTimeout(() => controller.abort(), 15000);
        let page: SaleLookup;
        try {
          page = await getJson<SaleLookup>(
            `/api/sales/lookup?kind=products&channel=${channel}&offset=${offset}`,
            request.signal,
          );
        } finally {
          clearTimeout(requestTimeout);
        }
        if (disposed) return;
        if (first && page.total !== first.total) {
          // Offset pages now describe different menus. Discard the old partial
          // result and read again, but leave further changes for a user retry.
          offset = 0;
          first = undefined;
          state = {
            ...state,
            data: { rows: [], total: 0 },
            complete: false,
          };
          onChange(state);
          if (restarts === 1)
            throw new Error(
              "La carta cambió mientras se cargaba. Reintentá para actualizar todos los productos.",
            );
          restarts++;
          continue;
        }
        first ??= page;
        // An unexpectedly empty page must remain retryable: marking it complete
        // would silently make the POS's local search omit the remaining menu.
        if (!page.rows.length && offset < first.total)
          throw new Error(
            "Falta completar la carta. Reintentá para cargar los productos restantes.",
          );
        offset += page.rows.length;
        const unique = [
          ...new Map(
            [...state.data.rows, ...page.rows].map((row) => [row.id, row]),
          ).values(),
        ];
        state = {
          ...state,
          data: { ...first, rows: unique },
          complete: offset >= first.total,
        };
        onChange(state);
        if (state.complete) {
          onComplete?.(unique);
          break;
        }
      }
    } catch (error) {
      if (!disposed)
        state = {
          ...state,
          error: request?.signal.aborted
            ? "La carta tardó demasiado en responder. Reintentá la carga."
            : error instanceof Error
              ? error.message
              : "No se pudo cargar la carta.",
          errorAttempt: state.errorAttempt + 1,
        };
    } finally {
      running = false;
      request = undefined;
      if (!disposed) {
        state = { ...state, loading: false };
        onChange(state);
      }
    }
  }
  return {
    load,
    dispose() {
      disposed = true;
      clearTimeout(requestTimeout);
      request?.abort();
    },
  };
}
