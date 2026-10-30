"use client";
import { useEffect, useState } from "react";
import { Users } from "lucide-react";
import type { WorkplaceSummarySnapshot } from "@/modules/workplace/service";

export function WorkplaceSummary({
  branchId,
  initial,
}: {
  branchId: string;
  initial?: WorkplaceSummarySnapshot;
}) {
  const [data, setData] = useState(initial ?? null),
    [error, setError] = useState("");
  useEffect(() => {
    let controller: AbortController | undefined;
    const load = () => {
      if (document.visibilityState === "hidden") return;
      controller?.abort();
      controller = new AbortController();
      const current = controller;
      void fetch("/api/workplace?view=summary", {
        cache: "no-store",
        signal: current.signal,
        headers: { "X-Kybo-Branch-Id": branchId },
      })
        .then(async (response) => {
          if (!response.ok)
            throw new Error(
              "No pudimos actualizar las responsables del turno.",
            );
          return response.json() as Promise<WorkplaceSummarySnapshot>;
        })
        .then((result) => {
          if (!current.signal.aborted) {
            setData(result);
            setError("");
          }
        })
        .catch(() => {
          if (!current.signal.aborted) {
            setData(null);
            setError("No pudimos actualizar las responsables del turno.");
          }
        });
    };
    const changed = (event: Event) => {
      if (
        (event as CustomEvent<{ branchId: string }>).detail?.branchId ===
        branchId
      )
        load();
    };
    load();
    const timer = window.setInterval(load, 30000);
    document.addEventListener("visibilitychange", load);
    window.addEventListener("focus", load);
    window.addEventListener("kybo:workplace-changed", changed);
    return () => {
      controller?.abort();
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
      window.removeEventListener("focus", load);
      window.removeEventListener("kybo:workplace-changed", changed);
    };
  }, [branchId]);
  const clock = (value: string) =>
    new Intl.DateTimeFormat("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: data?.timeZone,
    }).format(new Date(value));
  return (
    <section
      aria-label="Responsables del turno"
      className="flex flex-wrap items-center gap-x-5 gap-y-2 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3 text-sm"
    >
      <div className="flex items-center gap-2 font-semibold text-brand">
        <Users size={18} aria-hidden="true" />
        Responsables del turno
      </div>
      <div className="flex flex-1 flex-wrap gap-x-5 gap-y-2">
        {data?.rows.map((row) => (
          <div key={`${row.personName}:${row.stationName}:${row.startsAt}`}>
            <strong className="text-brand">
              {row.stationName}: {row.personName}
            </strong>
            <span className="ml-2 text-xs text-muted">
              {clock(row.startsAt)}–{clock(row.endsAt)}
            </span>
          </div>
        ))}
        {!data?.rows.length && (
          <p className="text-xs text-muted" role={error ? "status" : undefined}>
            {error ||
              (data
                ? "Sin responsables asignadas en este horario."
                : "Consultando puestos…")}
          </p>
        )}
      </div>
      <p className="w-full text-xs text-muted">
        Las ventas se registran con la cuenta del local. La asignación indica la
        responsabilidad del puesto.
      </p>
    </section>
  );
}
