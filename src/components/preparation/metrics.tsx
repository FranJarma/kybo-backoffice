"use client";
import { useEffect, useState } from "react";
import { ArrowLeft, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getJson, today } from "@/components/inventory/shared";
import { Control } from "@/components/sales/shared";
import { originLabels } from "@/modules/sales/types";
import type { PrepMetrics } from "@/modules/preparation/types";
import { duration } from "./card";
export function PrepMetricsPanel({ onClose }: { onClose: () => void }) {
  const [date, setDate] = useState(today),
    [data, setData] = useState<PrepMetrics | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  useEffect(() => {
    let live = true;
    const timer = setTimeout(() => {
      setLoading(true);
      getJson<PrepMetrics>(
        `/api/preparation/metrics?date=${encodeURIComponent(date)}`,
      )
        .then((r) => {
          if (live) {
            setData(r);
            setError("");
          }
        })
        .catch((e) => {
          if (live) setError(e.message);
        })
        .finally(() => {
          if (live) setLoading(false);
        });
    }, 0);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [date]);
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="eyebrow">Servicio de Kybo</p>
          <h1 className="mt-1 text-2xl font-extrabold text-brand">
            Tiempos de atención
          </h1>
        </div>
        <Button variant="outline" onClick={onClose}>
          <ArrowLeft size={16} />
          Volver a comandas
        </Button>
      </div>
      <div className="max-w-xs">
        <Control label="Fecha del resumen">
          <Input
            type="date"
            required
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </Control>
      </div>
      {error && (
        <p role="alert" className="text-sm text-rose-700">
          {error}
        </p>
      )}
      {loading ? (
        <p className="text-sm text-muted">Consultando tiempos…</p>
      ) : (
        data &&
        !error && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {(
                [
                  ["Espera antes de empezar", data.averages.waitSeconds],
                  ["Tiempo de preparación", data.averages.prepSeconds],
                  ["Listo hasta entregado", data.averages.handoffSeconds],
                  ["Atención completa", data.averages.totalSeconds],
                ] as const
              ).map(([label, value]) => (
                <div
                  key={label}
                  className="rounded-xl border border-line bg-white p-5"
                >
                  <Clock3 size={18} className="mb-3 text-blue" />
                  <p className="text-xs text-muted">{label}</p>
                  <p className="mt-3 text-3xl font-extrabold tabular-nums tracking-tight text-brand">
                    {duration(value)}
                  </p>
                </div>
              ))}
            </div>
            <p className="text-xs leading-relaxed text-muted">
              Promedios de {data.sample}{" "}
              {data.sample === 1
                ? "comanda completamente entregada"
                : "comandas completamente entregadas"}
              . Las estaciones en paralelo no se suman. Se excluyen ventas
              anuladas y tiempos incompletos; no equivalen a horas trabajadas.
            </p>
            <div className="rounded-xl border border-line bg-white p-5">
              <h2 className="text-base font-bold text-brand">
                Comandas por origen
              </h2>
              <p className="mt-1 text-xs text-muted">
                {data.orders} comandas registradas en esta fecha comercial. Una
                mesa puede tener varias comandas.
              </p>
              <div className="mt-5 space-y-5">
                {(
                  Object.entries(data.byOrigin) as [
                    keyof typeof originLabels,
                    number,
                  ][]
                ).map(([origin, n]) => (
                  <div key={origin}>
                    <div className="mb-2 flex justify-between text-sm">
                      <span>{originLabels[origin]}</span>
                      <strong className="tabular-nums">{n}</strong>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface">
                      <div
                        className="h-full rounded-full bg-blue"
                        style={{
                          width: `${data.orders ? (n / data.orders) * 100 : 0}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )
      )}
    </section>
  );
}
