"use client";
import { useEffect, useRef, useState } from "react";
import { privateRequest } from "@/components/identity/client";
import { qrClientDeadline } from "./qr-clock";
type Attempt = { id: string; expiresAt: string; serverNow: string };
export function useAttendanceQrAttempt(branchId: string, code?: string) {
  const [attempt, setAttempt] = useState<Attempt | null>(null),
    [error, setError] = useState(""),
    [opening, setOpening] = useState(false);
  const deadline = useRef(0),
    request = useRef<{ code: string; id: string } | null>(null);
  useEffect(() => {
    if (!code) return;
    const abort = new AbortController();
    if (request.current?.code !== code)
      request.current = { code, id: crypto.randomUUID() };
    void (async () => {
      setOpening(true);
      setError("");
      setAttempt(null);
      try {
        const started = performance.now();
        const result = await privateRequest<Attempt>(
          "/api/attendance/qr",
          branchId,
          { code, requestId: request.current!.id },
          abort.signal,
        );
        if (abort.signal.aborted) return;
        deadline.current = qrClientDeadline(
          result.serverNow,
          result.expiresAt,
          started,
        );
        if (deadline.current <= performance.now())
          throw new Error("El intento venció. Escaneá el QR actual del local.");
        setAttempt(result);
      } catch (e) {
        if (!abort.signal.aborted) setError((e as Error).message);
      } finally {
        if (!abort.signal.aborted) setOpening(false);
      }
    })();
    const interval = setInterval(() => {
      if (deadline.current && performance.now() >= deadline.current) {
        deadline.current = 0;
        setAttempt(null);
        setError("El intento venció. Escaneá el QR actual del local.");
      }
    }, 500);
    return () => {
      abort.abort();
      clearInterval(interval);
    };
  }, [branchId, code]);
  return {
    attempt,
    error,
    opening,
    consume: () => {
      deadline.current = 0;
      setAttempt(null);
      setError("");
    },
  };
}
