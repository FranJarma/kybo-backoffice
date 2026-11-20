import { getJson } from "@/components/inventory/shared";
import type { LocatorFleet } from "@/modules/pickup/types";

export type LocatorPollingEnvironment = {
  available: () => boolean;
  subscribe: (resume: () => void) => () => void;
};

const unavailable = "No se pudo actualizar la disponibilidad de localizadores.";

function browserEnvironment(): LocatorPollingEnvironment {
  return {
    available: () =>
      (typeof document === "undefined" ||
        document.visibilityState !== "hidden") &&
      (typeof navigator === "undefined" || navigator.onLine !== false),
    subscribe(resume) {
      if (typeof window === "undefined") return () => {};
      document.addEventListener("visibilitychange", resume);
      window.addEventListener("online", resume);
      window.addEventListener("offline", resume);
      return () => {
        document.removeEventListener("visibilitychange", resume);
        window.removeEventListener("online", resume);
        window.removeEventListener("offline", resume);
      };
    },
  };
}

export function startLocatorPolling({
  onFleet,
  onError,
  environment = browserEnvironment(),
}: {
  onFleet: (fleet: LocatorFleet) => void;
  onError: (error: string) => void;
  environment?: LocatorPollingEnvironment;
}) {
  let live = true;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let request:
    | { controller: AbortController; timeout: ReturnType<typeof setTimeout> }
    | undefined;
  let failures = 0;

  function cancelRequest() {
    if (!request) return;
    clearTimeout(request.timeout);
    request.controller.abort();
    request = undefined;
  }

  async function load() {
    if (!live || request || !environment.available()) return;
    clearTimeout(timer);
    const controller = new AbortController();
    const current = {
      controller,
      timeout: setTimeout(() => controller.abort(), 15000),
    };
    request = current;
    try {
      const result = await getJson<LocatorFleet>(
        "/api/pickup",
        controller.signal,
      );
      if (live && request === current && !controller.signal.aborted) {
        onFleet(result);
        onError("");
        failures = 0;
      }
    } catch {
      if (live && request === current) {
        failures++;
        onError(unavailable);
      }
    } finally {
      clearTimeout(current.timeout);
      if (request === current) {
        request = undefined;
        if (live && environment.available())
          timer = setTimeout(
            () => void load(),
            Math.min(30000, 5000 * 2 ** failures),
          );
      }
    }
  }

  const unsubscribe = environment.subscribe(() => {
    clearTimeout(timer);
    if (environment.available()) void load();
    else {
      cancelRequest();
      onError(unavailable);
    }
  });
  void load();
  return () => {
    live = false;
    unsubscribe();
    clearTimeout(timer);
    cancelRequest();
  };
}
