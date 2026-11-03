"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { privateRequest, RequestFailure } from "@/components/identity/client";
import type { PrintingSnapshot } from "@/modules/printing/types";

type Command = Record<string, unknown>;
export function usePrinting(
  branchId: string,
  actorId: string,
  saleId?: string,
  intervalMs = 15000,
) {
  const [data, setData] = useState<PrintingSnapshot>();
  const [error, setError] = useState("");
  const [readError, setReadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const pending = useRef<{
    key: string;
    requestId: string;
    command: Command;
  } | null>(null);
  const storageKey = `kybo-printing-pending:${actorId}:${branchId}:${saleId ?? "settings"}`;
  useEffect(() => {
    let active = true;
    pending.current = null;
    try {
      const saved = sessionStorage.getItem(storageKey);
      if (saved) {
        pending.current = JSON.parse(saved);
        queueMicrotask(() => {
          if (!active) return;
          setUncertain(true);
          setError(
            "Hay una operación sin respuesta. Reintentá la misma operación para conocer su resultado.",
          );
        });
      }
    } catch {
      /* Storage may be unavailable. The current session still retains the request. */
    }
    return () => {
      active = false;
    };
  }, [storageKey]);
  const inFlight = useRef<AbortController | null>(null);
  const load = useCallback(async () => {
    if (inFlight.current) return;
    const controller = new AbortController();
    inFlight.current = controller;
    try {
      const snapshot = await privateRequest<PrintingSnapshot>(
        `/api/printing${saleId ? `?saleId=${encodeURIComponent(saleId)}` : ""}`,
        branchId,
        undefined,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        setData(snapshot);
        setReadError("");
      }
    } catch (e) {
      if (!controller.signal.aborted)
        setReadError(
          e instanceof Error ? e.message : "No se pudo consultar la impresión.",
        );
    } finally {
      if (inFlight.current === controller) inFlight.current = null;
    }
  }, [branchId, saleId]);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (active && document.visibilityState === "visible") void load();
    };
    refresh();
    const timer = window.setInterval(refresh, intervalMs);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      inFlight.current?.abort();
      inFlight.current = null;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [load, intervalMs]);
  const send = async (command: Command) => {
    const key = JSON.stringify(command);
    if (pending.current && pending.current.key !== key) {
      setError(
        "Hay una operación sin respuesta. Reintentá esa misma operación antes de continuar.",
      );
      return null;
    }
    if (!pending.current)
      pending.current = { key, requestId: crypto.randomUUID(), command };
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(pending.current));
    } catch {
      /* Retain the request in memory. */
    }
    setBusy(true);
    setError("");
    try {
      const result = await privateRequest<{
        id?: string;
        code?: string;
        expiresAt?: string;
      }>("/api/printing", branchId, {
        requestId: pending.current.requestId,
        command,
      });
      pending.current = null;
      try {
        sessionStorage.removeItem(storageKey);
      } catch {}
      setUncertain(false);
      await load();
      return result;
    } catch (e) {
      if (e instanceof RequestFailure && e.status < 500) {
        pending.current = null;
        try {
          sessionStorage.removeItem(storageKey);
        } catch {}
        setUncertain(false);
      } else setUncertain(true);
      setError(
        e instanceof Error ? e.message : "No se pudo completar la operación.",
      );
      return null;
    } finally {
      setBusy(false);
    }
  };
  const retry = () =>
    pending.current ? send(pending.current.command) : Promise.resolve(null);
  return {
    data,
    error: error || readError,
    busy,
    uncertain,
    retry,
    send,
    load,
  };
}
export function currentPrintingBranch() {
  return typeof document === "undefined"
    ? ""
    : (document.cookie
        .split("; ")
        .find((c) => c.startsWith("kybo-branch="))
        ?.split("=")[1] ?? "");
}
