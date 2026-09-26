"use client";
import { useEffect, useState } from "react";
import type { PrepList, PrepDetail } from "@/modules/preparation/types";
type Snapshot<T> = { key: string; data: T; received: number };
function usePreparationResource<T>(url: string, revision: number) {
  const key = `${url}:${revision}`;
  const [snapshot, setSnapshot] = useState<Snapshot<T> | null>(null),
    [error, setError] = useState(""),
    [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true,
      serial = 0,
      controller: AbortController | null = null;
    let poll: ReturnType<typeof setTimeout> | undefined;
    async function load() {
      if (document.hidden) return;
      clearTimeout(poll);
      const n = ++serial;
      controller?.abort();
      controller = new AbortController();
      const own = controller,
        timeout = setTimeout(() => own.abort(), 9000);
      try {
        if (!navigator.onLine)
          throw new Error(
            "Sin conexión. Los cambios esperan a que recuperes internet.",
          );
        const response = await fetch(url, {
          cache: "no-store",
          signal: own.signal,
        });
        if (!response.ok) {
          if (response.status === 401 && alive) setSnapshot(null);
          const body = await response.json();
          throw new Error(body.error || "No pudimos actualizar la cola.");
        }
        const data: T = await response.json();
        if (alive && n === serial) {
          const received = performance.now();
          setSnapshot({ key, data, received });
          setTick(received);
          setError("");
        }
      } catch (e) {
        if (alive && n === serial)
          setError(
            e instanceof Error && e.name !== "AbortError"
              ? e.message
              : "No pudimos confirmar la conexión. Actualizá antes de continuar.",
          );
      } finally {
        clearTimeout(timeout);
        if (alive && n === serial) poll = setTimeout(load, 5000);
      }
    }
    const wake = () => {
      if (!document.hidden) {
        setError("Actualizando la cola…");
        void load();
      }
    };
    const offline = () => {
      ++serial;
      controller?.abort();
      setError("Sin conexión. Los cambios esperan a que recuperes internet.");
    };
    const initial = setTimeout(load, 0),
      clock = setInterval(() => setTick(performance.now()), 1000);
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    window.addEventListener("offline", offline);
    return () => {
      alive = false;
      serial++;
      clearTimeout(initial);
      clearTimeout(poll);
      clearInterval(clock);
      controller?.abort();
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
      window.removeEventListener("offline", offline);
    };
  }, [url, key]);
  const age = snapshot ? Math.max(0, tick - snapshot.received) : Infinity;
  return {
    data: snapshot?.data ?? null,
    error,
    fresh: !!snapshot && snapshot.key === key && !error && age <= 15000,
    ageSeconds: Number.isFinite(age) ? Math.floor(age / 1000) : null,
    age,
  };
}
export function usePreparationFeed(url: string, revision: number) {
  const feed = usePreparationResource<PrepList>(url, revision);
  return {
    ...feed,
    now: feed.data ? Date.parse(feed.data.serverNow) + feed.age : 0,
  };
}
export function usePreparationDetail(id: string, revision: number) {
  return usePreparationResource<PrepDetail>(`/api/preparation/${id}`, revision);
}
