"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DailySnapshot } from "@/modules/daily-operations/types";

export function useDayFeed(query: string, role: string) {
  const [snapshot, setSnapshot] = useState<{
    query: string;
    data: DailySnapshot;
  } | null>(null);
  const [issue, setIssue] = useState<{ query: string; message: string } | null>(
    null,
  );
  const [reconcileError, setReconcileError] = useState("");
  const [updating, setUpdating] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const mounted = useRef(false);
  const sequence = useRef(0);
  const request = useRef<AbortController | null>(null);
  const inFlight = useRef(false);
  const reconcileKey = useRef<string | null>(null);
  const reconcileUncertain = useRef(false);
  const read = useCallback(async () => {
    const ticket = ++sequence.current;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    const timeout = setTimeout(() => controller.abort(), 12_000);
    setUpdating(true);
    try {
      const response = await fetch(`/api/operations/day?${query}`, {
        cache: "no-store",
        signal: controller.signal,
      });
      const body = await response.json();
      if (!response.ok)
        throw Error(body.error ?? "No pudimos consultar las tareas.");
      if (
        !Array.isArray(body.tasks) ||
        !Array.isArray(body.locations) ||
        !body.summary
      )
        throw Error("No pudimos confirmar la información. Volvé a actualizar.");
      if (mounted.current && ticket === sequence.current) {
        setSnapshot({ query, data: body });
        setIssue(null);
      }
      return body as DailySnapshot;
    } catch (failure) {
      if (mounted.current && ticket === sequence.current)
        setIssue({
          query,
          message:
            failure instanceof Error && failure.name !== "AbortError"
              ? failure.message
              : "La consulta demoró demasiado. Volvé a actualizar.",
        });
      throw failure;
    } finally {
      clearTimeout(timeout);
      if (mounted.current && ticket === sequence.current) setUpdating(false);
    }
  }, [query]);
  const latestRead = useRef(read);
  const cancelRead = useCallback(() => {
    sequence.current++;
    request.current?.abort();
  }, []);
  useEffect(() => {
    latestRead.current = read;
  }, [read]);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      cancelRead();
    };
  }, [cancelRead]);
  useEffect(() => {
    const initial = setTimeout(() => {
      void read().catch(() => {});
    }, 0);
    return () => {
      clearTimeout(initial);
      cancelRead();
    };
  }, [read, cancelRead]);
  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setReconciling(true);
    let message = "";
    try {
      if (role !== "staff") {
        reconcileKey.current ??= crypto.randomUUID();
        const previouslyUncertain = reconcileUncertain.current;
        reconcileUncertain.current = true;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 12_000);
        try {
          const response = await fetch("/api/operations/day/reconcile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requestId: reconcileKey.current }),
            signal: controller.signal,
          });
          const body = await response.json();
          if (response.ok) {
            reconcileKey.current = null;
            reconcileUncertain.current = false;
          } else {
            reconcileUncertain.current =
              previouslyUncertain || response.status >= 500;
            if (!reconcileUncertain.current) reconcileKey.current = null;
            message =
              body.error ??
              "No pudimos generar las tareas. Volvé a actualizar.";
          }
        } catch {
          message = "No pudimos actualizar las necesidades. Volvé a intentar.";
        } finally {
          clearTimeout(timeout);
        }
      }
      if (mounted.current) setReconcileError(message);
      if (mounted.current) await latestRead.current();
    } catch {
      /* The current read owns its error; obsolete requests cannot replace it. */
    } finally {
      inFlight.current = false;
      if (mounted.current) setReconciling(false);
    }
  }, [role]);
  useEffect(() => {
    const initial = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 60_000);
    const wake = () => {
      if (!document.hidden) void latestRead.current().catch(() => {});
    };
    window.addEventListener("focus", wake);
    window.addEventListener("online", wake);
    document.addEventListener("visibilitychange", wake);
    return () => {
      clearTimeout(initial);
      clearInterval(timer);
      window.removeEventListener("focus", wake);
      window.removeEventListener("online", wake);
      document.removeEventListener("visibilitychange", wake);
    };
  }, [refresh]);
  const current = snapshot?.query === query;
  const error = (issue?.query === query ? issue.message : "") || reconcileError;
  return {
    data: current ? snapshot.data : null,
    metadata: snapshot?.data,
    loading: !current && !error,
    updating,
    busy: reconciling,
    error,
    disabled: !current || !!error,
    read,
    refresh,
  };
}
