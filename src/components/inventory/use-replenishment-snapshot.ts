"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReplenishmentSnapshot } from "@/modules/replenishment/types";
const endpoint = "/api/inventory/replenishment";
function branchId() {
  return (
    document.cookie
      .split("; ")
      .find((cookie) => cookie.startsWith("kybo-branch="))
      ?.split("=")[1] ?? ""
  );
}

export function useReplenishmentSnapshot(refresh = 0) {
  const [snapshot, setSnapshot] = useState<ReplenishmentSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const reload = useCallback(() => setRevision((current) => current + 1), []);
  useEffect(() => {
    let disposed = false;
    let sequence = 0;
    async function load() {
      controller.current?.abort();
      const request = new AbortController();
      controller.current = request;
      const current = ++sequence;
      const branch = branchId();
      setLoading(true);
      try {
        const response = await fetch(endpoint, {
          cache: "no-store",
          signal: request.signal,
          headers: branch ? { "X-Kybo-Branch-Id": branch } : {},
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(
            body.error || "No pudimos consultar las alertas de reposición.",
          );
        }
        const data = (await response.json()) as ReplenishmentSnapshot;
        if (!disposed && current === sequence && branch === branchId()) {
          setSnapshot(data);
          setError("");
        }
      } catch (reason) {
        if (!disposed && current === sequence && !request.signal.aborted)
          setError(
            reason instanceof Error
              ? reason.message
              : "No pudimos consultar las alertas de reposición.",
          );
      } finally {
        if (!disposed && current === sequence) setLoading(false);
      }
    }
    const initial = setTimeout(() => {
      void load();
    }, 0);
    const tick = setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 60_000);
    const visible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      disposed = true;
      controller.current?.abort();
      clearTimeout(initial);
      clearInterval(tick);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [refresh, revision]);
  return { snapshot, loading, error, reload };
}
