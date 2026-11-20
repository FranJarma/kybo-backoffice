"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import type { PrintingSnapshot } from "@/modules/printing/types";
import {
  ConfirmQueueRemoval,
  kindLabels,
  printStateLabels,
} from "./order-printing";
import { usePrinting } from "./use-printing";

const printerStatuses: Record<string, string> = {
  ready: "Lista",
  offline: "Sin conexión",
  "paper-out": "Sin papel",
  unknown: "Desconocido",
  error: "Error",
};
export function PrintingSettingsView({
  data,
  busy,
  send,
  pairing,
  setPairing,
}: {
  pairing: { code: string; expiresAt: string } | null;
  setPairing: (value: { code: string; expiresAt: string }) => void;
  data: PrintingSnapshot;
  busy: boolean;
  send: (
    command: Record<string, unknown>,
  ) => Promise<{ id?: string; code?: string; expiresAt?: string } | null>;
}) {
  const [enabled, setEnabled] = useState(data.settings?.enabled ?? false);
  const [printerName, setPrinterName] = useState(
    data.settings?.printerName ?? "",
  );

  return (
    <div className="space-y-5">
      {!data.ready ? (
        <p className="rounded-xl bg-amber-50 p-4 text-sm text-amber-950">
          Impresión con activación pendiente. {data.message}
        </p>
      ) : (
        <>
          {data.canConfigure && (
            <section className="rounded-xl border border-line bg-white p-5">
              <h2 className="font-bold text-brand">Impresora de la sucursal</h2>
              <p className="mt-1 text-sm text-muted">
                Indicá el nombre exacto de la cola instalada en Windows.
              </p>
              <form
                className="mt-4 space-y-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  void send({
                    action: "configure",
                    revision: data.settings?.revision ?? 0,
                    enabled,
                    printerName,
                  });
                }}
              >
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) => setEnabled(e.target.checked)}
                  />{" "}
                  Activar impresión automática
                </label>
                <label className="block text-sm font-semibold">
                  Nombre de la impresora *
                  <input
                    className="mt-2 min-h-11 w-full rounded-lg border border-line px-3"
                    value={printerName}
                    onChange={(e) => setPrinterName(e.target.value)}
                    required
                    maxLength={160}
                  />
                </label>
                <Button disabled={busy}>Guardar configuración</Button>
              </form>
            </section>
          )}
          <section className="rounded-xl border border-line bg-white p-5">
            <h2 className="font-bold text-brand">Conector de Windows</h2>
            <p className="mt-2 text-sm">
              Conector:{" "}
              <strong>
                {data.connector
                  ? data.connector.connected
                    ? "Conectado"
                    : "Sin conexión"
                  : "No vinculado"}
              </strong>
            </p>
            {data.connector && (
              <>
                <p className="mt-1 text-sm">
                  Impresora:{" "}
                  <strong>
                    {printerStatuses[data.connector.printerStatus] ??
                      "Desconocido"}
                  </strong>
                  {data.connector.printerMessage &&
                    ` · ${data.connector.printerMessage}`}
                </p>
                <p className="mt-1 text-xs text-muted">
                  Última conexión:{" "}
                  {data.connector.lastSeenAt
                    ? new Date(data.connector.lastSeenAt).toLocaleString(
                        "es-AR",
                      )
                    : "sin registro"}
                </p>
              </>
            )}
            {data.canConfigure && (
              <div className="mt-4 flex flex-wrap gap-2">
                {/* This endpoint returns a file, so it requires a document navigation. */}
                {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
                <a
                  className="inline-flex min-h-11 items-center rounded-lg border border-line px-4 text-sm font-semibold text-brand"
                  href="/api/printing/installer"
                >
                  Descargar instalador
                </a>
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    void send({ action: "pairing" }).then((result) => {
                      if (result?.code && result.expiresAt)
                        setPairing({
                          code: result.code,
                          expiresAt: result.expiresAt,
                        });
                    });
                  }}
                >
                  Generar código de vinculación
                </Button>
                {data.connector && (
                  <Button
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          "¿Revocar este conector? Dejará de recibir trabajos.",
                        )
                      )
                        void send({
                          action: "revoke",
                          connectorId: data.connector!.id,
                        });
                    }}
                  >
                    Revocar conector
                  </Button>
                )}
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    void send({ action: "test" });
                  }}
                >
                  Enviar ticket de prueba
                </Button>
              </div>
            )}
            {pairing && (
              <p className="mt-4 rounded-lg bg-blue-50 p-3 text-sm">
                Código de un solo uso:{" "}
                <strong className="break-all font-mono text-sm">
                  {pairing.code}
                </strong>
                <br />
                Vence: {new Date(pairing.expiresAt).toLocaleString("es-AR")}
              </p>
            )}
          </section>
          {data.canManage && (
            <section className="rounded-xl border border-line bg-white p-5">
              <h2 className="font-bold text-brand">Cola e historial</h2>
              <p className="mt-1 text-sm text-muted">
                Revisá la cola de Windows antes de resolver un envío incierto.
                Enviado no confirma la salida en papel.
              </p>
              {!data.jobs.length && (
                <p className="mt-3 text-sm text-muted">
                  No hay trabajos registrados.
                </p>
              )}
              <div className="divide-y divide-line">
                {data.jobs.map((job) => (
                  <article key={job.id} className="py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <strong className="text-sm">
                          Pedido {job.saleNumber}.{job.sequence} ·{" "}
                          {job.stationName}
                        </strong>
                        <p className="text-xs text-muted">
                          {printStateLabels[job.state] ?? job.state} ·{" "}
                          {kindLabels[job.kind] ?? job.kind}
                          {job.reason ? ` · ${job.reason}` : ""} ·{" "}
                          {job.requestedBy}
                        </p>
                        {job.error && (
                          <p className="mt-1 text-sm text-red-700">
                            {job.error}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {job.canRetry && (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={busy}
                            onClick={() => {
                              void send({ action: "retry", jobId: job.id });
                            }}
                          >
                            Reintentar
                          </Button>
                        )}
                        {(job.state === "uncertain" ||
                          job.state === "review") && (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              disabled={busy}
                              onClick={() => {
                                if (
                                  window.confirm(
                                    "¿Confirmás que el ticket salió en papel y que el trabajo ya no está en la cola de Windows?",
                                  )
                                )
                                  void send({
                                    action: "resolve",
                                    jobId: job.id,
                                    result: "printed",
                                  });
                              }}
                            >
                              Marcar impreso
                            </Button>
                            <ConfirmQueueRemoval
                              job={job}
                              busy={busy}
                              onManage={send}
                            />
                          </>
                        )}
                        {job.state === "cancelled" &&
                          job.spoolState !== "removed" && (
                            <ConfirmQueueRemoval
                              job={job}
                              busy={busy}
                              onManage={send}
                            />
                          )}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
export function PrintingSettings({
  branchId,
  actorId,
}: {
  branchId: string;
  actorId: string;
}) {
  const [pairing, setPairing] = useState<{
    code: string;
    expiresAt: string;
  } | null>(null);
  const { data, error, busy, uncertain, retry, send, load } = usePrinting(
    branchId,
    actorId,
  );
  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-brand">
          Impresión de comandas
        </h1>
        <p className="mt-1 text-sm text-muted">
          Configurá la impresora y revisá los trabajos de esta sucursal.
        </p>
      </div>
      {error && (
        <div
          role="alert"
          className="rounded-lg bg-red-50 p-4 text-sm text-red-800"
        >
          {error} Podés volver a intentar la misma operación.{" "}
          <button className="underline" onClick={() => void load()}>
            Actualizar estado
          </button>
        </div>
      )}
      {uncertain && (
        <Button
          type="button"
          variant="outline"
          disabled={busy}
          onClick={() =>
            void retry().then((result) => {
              if (result?.code && result.expiresAt)
                setPairing({ code: result.code, expiresAt: result.expiresAt });
            })
          }
        >
          Reintentar la misma operación
        </Button>
      )}
      {data ? (
        <PrintingSettingsView
          key={`${data.settings?.revision ?? 0}`}
          data={data}
          busy={busy || uncertain}
          send={send}
          pairing={pairing}
          setPairing={setPairing}
        />
      ) : (
        <p className="text-sm text-muted">Cargando impresión…</p>
      )}
    </div>
  );
}
