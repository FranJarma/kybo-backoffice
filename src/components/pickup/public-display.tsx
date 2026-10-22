"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import type { PublicQueue } from "@/modules/pickup/types";

export function PickupDisplay({ queueKey }: { queueKey: string }) {
  const [data, setData] = useState<PublicQueue>();
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    let live = true,
      offset = 0;
    let timer: ReturnType<typeof setTimeout>;
    let controller: AbortController;
    async function load() {
      controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetch(
          `/api/public/pickup/${encodeURIComponent(queueKey)}?offset=${offset}`,
          { cache: "no-store", credentials: "omit", signal: controller.signal },
        );
        if (!response.ok) throw new Error("unavailable");
        const result: PublicQueue = await response.json();
        if (live) {
          setData(result);
          setUnavailable(false);
          offset = result.nextOffset;
        }
      } catch {
        if (live) {
          setUnavailable(true);
          setData(undefined);
          offset = 0;
        }
      } finally {
        clearTimeout(timeout);
        if (live) timer = setTimeout(load, 5000);
      }
    }
    void load();
    return () => {
      live = false;
      clearTimeout(timer);
      controller?.abort();
    };
  }, [queueKey]);
  return <PublicBoard data={data} unavailable={unavailable} />;
}

export function PublicBoard({
  data,
  unavailable,
}: {
  data?: PublicQueue;
  unavailable: boolean;
}) {
  return (
    <main className="min-h-dvh bg-[#f7f7f7] text-[#063f5c]">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-[#063f5c]/15 px-6 py-7 md:px-12">
        <div>
          <Image
            src="/assets/kybo-logo.png"
            alt="Kybo"
            width={1425}
            height={658}
            preload
            className="h-auto w-32 md:w-40"
          />
          <p className="mt-1 text-sm font-semibold">
            {data?.branchName ?? "Retiro de pedidos"}
          </p>
        </div>
        <p className="text-lg font-medium md:text-2xl">
          Tu pedido, recién hecho.
        </p>
      </header>
      {unavailable ? (
        <div role="status" className="mx-auto max-w-2xl px-6 py-28 text-center">
          <h1 className="text-3xl font-bold">Estamos reconectando</h1>
          <p className="mt-5 text-lg">
            Consultá a nuestro equipo por tu pedido. La pantalla se actualizará
            automáticamente.
          </p>
        </div>
      ) : !data ? (
        <p role="status" className="p-12 text-xl">
          Actualizando pedidos…
        </p>
      ) : (
        <div className="grid min-h-[70dvh] md:grid-cols-2">
          {(["preparing", "ready"] as const).map((state) => {
            const ready = state === "ready",
              rows = data.rows.filter((r) => r.state === state);
            return (
              <section
                key={state}
                className={
                  ready
                    ? "bg-[#063f5c] px-6 py-9 text-white md:px-10"
                    : "bg-[#f27f0c] px-6 py-9 md:px-10"
                }
                aria-label={ready ? "Listos para retirar" : "En preparación"}
              >
                <p
                  className={`mb-2 text-xs font-bold uppercase tracking-[0.22em] ${ready ? "text-[#f27f0c]" : "text-[#063f5c]"}`}
                >
                  {ready ? "Acercate al mostrador" : "Estamos preparando"}
                </p>
                <h1 className="text-3xl font-extrabold tracking-tight lg:text-4xl">
                  {ready ? "Listos para retirar" : "En preparación"}
                </h1>
                <div
                  className="mt-8 grid grid-cols-2 gap-x-5 gap-y-5 lg:grid-cols-3"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {rows.map((row) => (
                    <article
                      key={row.label}
                      className={`border-t-2 py-4 ${ready ? "border-white/30" : "border-[#063f5c]/30"}`}
                    >
                      <p className="text-xs font-semibold uppercase tracking-wider">
                        {row.locatorNumber == null ? "Pedido" : "Localizador"}
                      </p>
                      <p className="mt-2 break-all text-4xl font-extrabold tabular-nums lg:text-5xl">
                        {row.locatorNumber ?? row.label}
                      </p>
                      {row.customerName && (
                        <p className="mt-2 line-clamp-2 break-words text-lg font-bold leading-snug [overflow-wrap:anywhere] lg:text-xl">
                          {row.customerName}
                        </p>
                      )}
                      {row.locatorNumber != null && (
                        <p className="mt-2 text-sm opacity-80">
                          Pedido {row.label}
                        </p>
                      )}
                    </article>
                  ))}
                </div>
                {!rows.length && (
                  <p className="mt-12 text-lg opacity-70">
                    {ready
                      ? "Los próximos pedidos aparecerán acá."
                      : "Sin pedidos en preparación."}
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}
      <footer className="px-6 py-5 text-center text-sm font-medium">
        Buscá tu número de pedido o localizador · Gracias por elegir Kybo
      </footer>
    </main>
  );
}
