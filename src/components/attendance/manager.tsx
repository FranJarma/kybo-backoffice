"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Fingerprint,
  RefreshCw,
  Settings2,
  ChevronLeft,
  ChevronRight,
  ScanLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  privateRequest,
  RequestFailure,
  currentLocation,
  verifyIdentity,
} from "@/components/identity/client";
import { IdentityDevices } from "@/components/identity/verification";
import { PersonalAttendance } from "./personal";
import { AttendanceRegister, CorrectionForm } from "./register";
import { ManualRequests } from "./manual";
import { AttendancePlanning } from "./planning";
import { AttendanceSettings } from "./settings";
import {
  Field,
  dateLabel,
  AttendanceErrorContext,
  type Snapshot,
} from "./shared";
import type { AttendanceCommand } from "@/modules/attendance/validation";
import { addDays } from "@/modules/attendance/rules";
import { AttendanceAttempts } from "./attempts";
import { useAttendanceQrAttempt } from "./use-qr-attempt";
import "./attendance.css";
type Mode = "attendance" | "planning" | "settings";
type Response =
  ({ ready: true } & Snapshot) | { ready: false; message: string };
type Result = { id: string; [key: string]: unknown };
function monday(day: string) {
  const index = new Date(day + "T12:00:00Z").getUTCDay();
  return addDays(day, -(index === 0 ? 6 : index - 1));
}
export function AttendanceManager({
  branchId,
  actorId,
  mode = "attendance",
  qrCode,
  personalView = false,
}: {
  branchId: string;
  actorId: string;
  mode?: Mode;
  qrCode?: string;
  personalView?: boolean;
}) {
  const qr = useAttendanceQrAttempt(
    branchId,
    mode === "attendance" ? qrCode : undefined,
  );
  const [response, setResponse] = useState<Response | null>(null),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [devices, setDevices] = useState(false),
    [correction, setCorrection] = useState(false),
    [tab, setTab] = useState("personal"),
    [filters, setFilters] = useState<{ from: string; to: string } | null>(null);
  const active = useRef(false),
    pending = useRef(new AttendanceAttempts()),
    revision = useRef(0);
  const query = filters ? `?${new URLSearchParams(filters)}` : "";
  const load = useCallback(
    async (signal?: AbortSignal) => {
      const current = ++revision.current;
      const result = await privateRequest<Response>(
        `/api/attendance${query}`,
        branchId,
        undefined,
        signal,
      );
      if (current !== revision.current || signal?.aborted) return;
      if (mode === "planning" && result.ready && !filters) {
        const from = monday(result.today);
        setFilters({ from, to: addDays(from, 6) });
      }
      setResponse(result);
    },
    [branchId, query, mode, filters],
  );
  useEffect(() => {
    const abort = new AbortController();
    let refreshing = false;
    const refresh = async () => {
      if (refreshing || active.current || document.visibilityState === "hidden")
        return;
      refreshing = true;
      try {
        await load(abort.signal);
      } catch (e) {
        if (!abort.signal.aborted) setError((e as Error).message);
      } finally {
        refreshing = false;
      }
    };
    void refresh();
    const interval = setInterval(() => void refresh(), 25000);
    window.addEventListener("focus", refresh);
    return () => {
      abort.abort();
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [load]);
  async function execute(
    command: AttendanceCommand,
    prepare?: (requestId: string) => Promise<AttendanceCommand>,
  ): Promise<Result> {
    if (active.current)
      throw new Error("Esperá a que termine la operación actual.");
    active.current = true;
    ++revision.current;
    setBusy(true);
    setError("");
    setNotice("");
    const snapshot = response?.ready ? response : null;
    const journal = snapshot?.ownJournal;
    const origin =
      command.action === "punch"
        ? `${journal?.businessDate ?? snapshot?.today}:${journal?.events.at(-1)?.id ?? snapshot?.current.entryId ?? "out"}`
        : "";
    const requestId = pending.current.begin(command, origin);
    try {
      const payload = prepare ? await prepare(requestId) : command;
      const result = await privateRequest<Result>("/api/attendance", branchId, {
        requestId,
        command: payload,
      });
      pending.current.forget(command, origin);
      if (command.action === "punch") qr.consume();
      setNotice(
        command.action === "punch"
          ? "Fichaje registrado."
          : command.action === "copyWeek"
            ? `Semana copiada: ${result.copied ?? 0} horarios. Los días ocupados se conservaron.`
            : "Cambios guardados.",
      );
      try {
        await load();
      } catch {
        setNotice(
          "La operación quedó guardada. Actualizá para ver los datos más recientes.",
        );
      }
      return result;
    } catch (e) {
      if (e instanceof RequestFailure && e.status < 500)
        pending.current.forget(command, origin);
      setError(
        e instanceof RequestFailure || (e instanceof Error && prepare)
          ? e.message
          : "No recibimos confirmación. Actualizá y volvé a intentar la misma acción; no se registrará dos veces.",
      );
      throw e;
    } finally {
      active.current = false;
      setBusy(false);
    }
  }
  async function punch(
    kind: "entry" | "pause" | "resume" | "exit",
    assignmentId?: string,
  ) {
    if (!qr.attempt) {
      setError(
        qr.error ||
          "Escaneá el QR actual del local antes de registrar una marca.",
      );
      return;
    }
    const base = {
      action: "punch" as const,
      kind,
      qrAttemptId: qr.attempt.id,
      ...(assignmentId ? { assignmentId } : {}),
      location: { latitude: 0, longitude: 0, accuracy: 1, measuredAt: "" },
    };
    try {
      await execute(base, async (requestId) => {
        const location = await currentLocation();
        const payload = {
          action: "punch" as const,
          kind,
          qrAttemptId: qr.attempt!.id,
          ...(assignmentId ? { assignmentId } : {}),
          location,
        };
        const verificationId = await verifyIdentity(
          branchId,
          "attendance-punch",
          requestId,
          payload,
        );
        return { ...payload, verificationId };
      });
    } catch {
      /* The accessible error above remains visible; never claim a saved punch. */
    }
  }
  const data = response?.ready ? response : null,
    manager = data && data.actor.role !== "staff" && !personalView;
  const personal =
    mode === "attendance" && (personalView || data?.actor.role === "staff");
  const title =
    mode === "settings"
      ? "Configuración de asistencia"
      : mode === "planning"
        ? "Horarios del equipo"
        : "Asistencia";
  return (
    <AttendanceErrorContext value={error}>
      <div className={`att-page${personal ? " att-personal-mode" : ""}`}>
        <div className="att-page-heading">
          <div>
            <span className="att-eyebrow">PERSONAL</span>
            <h1>{title}</h1>
            <p>
              {mode === "settings"
                ? "Zona de fichaje, participantes y autorizaciones por sucursal."
                : mode === "planning"
                  ? "Organizá turnos y pausas por persona y día."
                  : "Fichajes y seguimiento de la jornada del equipo."}
            </p>
          </div>
          <div className="att-toolbar">
            {mode === "attendance" && (
              <Button
                variant="outline"
                className="min-h-11"
                onClick={() => setDevices(true)}
                disabled={!data || busy}
              >
                <Fingerprint />
                Verificación del celular
              </Button>
            )}
            <Button
              variant="ghost"
              aria-label="Actualizar asistencia"
              disabled={busy}
              onClick={() => {
                setError("");
                void load().catch((e) => setError(e.message));
              }}
            >
              <RefreshCw />
            </Button>
            {data?.actor.role === "admin" && mode !== "settings" && (
              <Button
                variant="ghost"
                asChild
                aria-label="Configurar asistencia"
              >
                <Link href="/settings/attendance">
                  <Settings2 />
                </Link>
              </Button>
            )}
          </div>
        </div>
        {error && (
          <div role="alert" className="att-error">
            {error}
          </div>
        )}
        {notice && (
          <div role="status" className="att-success">
            {notice}
          </div>
        )}
        {busy && (
          <p role="status" className="att-progress">
            Verificando y guardando la operación…
          </p>
        )}
        {!response && (
          <div className="att-panel" aria-busy="true">
            Cargando asistencia…
          </div>
        )}
        {response && !response.ready && (
          <div className="att-panel">
            <h2>Asistencia lista para activar</h2>
            <p>{response.message}</p>
          </div>
        )}
        {data && (
          <>
            {mode === "attendance" && (
              <>
                <div
                  className="att-tabs"
                  role="tablist"
                  aria-label="Vistas de asistencia"
                >
                  {[
                    ["personal", "Mi jornada"],
                    ...(manager
                      ? [
                          ["register", "Registro del equipo"],
                          ["manual", "Autorizaciones"],
                        ]
                      : []),
                  ].map(([id, label]) => (
                    <button
                      key={id}
                      role="tab"
                      aria-selected={tab === id}
                      onClick={() => setTab(id)}
                    >
                      {label}
                      {id === "manual" &&
                      data.manualRequests.some(
                        (r) => r.status === "pending",
                      ) ? (
                        <span className="att-count">
                          {
                            data.manualRequests.filter(
                              (r) => r.status === "pending",
                            ).length
                          }
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
                {tab === "register" && (
                  <DateFilter data={data} onApply={setFilters} busy={busy} />
                )}
                {tab === "personal" && (
                  <>
                    <div
                      className={`att-qr-access ${qr.error ? "att-error" : "att-panel"}`}
                      role={qr.error ? "alert" : "status"}
                    >
                      <div className="att-verification-note">
                        <ScanLine size={24} />
                        <span>
                          <strong>
                            {qr.opening
                              ? "Validando el QR del local…"
                              : qr.attempt
                                ? "QR del local recibido"
                                : "Escaneá el QR del local"}
                          </strong>
                          <small>
                            {qr.error ||
                              (qr.attempt
                                ? "Podés registrar una marca. La ubicación y el desbloqueo se verifican al confirmar."
                                : "Lo encontrás en la PC o tablet. Se necesita un código vigente para cada entrada, pausa o salida.")}
                          </small>
                        </span>
                      </div>
                      <p className="att-subtle">
                        Vas a fichar como <strong>{data.actor.name}</strong>
                      </p>
                    </div>
                    <PersonalAttendance
                      data={data}
                      busy={busy}
                      onPunch={punch}
                    />
                    <div className="att-personal-footer">
                      <Button
                        variant="ghost"
                        onClick={() => setCorrection(true)}
                      >
                        Solicitar corrección de mis fichajes
                      </Button>
                      <InstallInstructions />
                    </div>
                    <section className="att-panel">
                      <h2>Mis próximos horarios</h2>
                      {data.assignments.filter((a) => a.userId === actorId)
                        .length ? (
                        data.assignments
                          .filter((a) => a.userId === actorId)
                          .map((a) => (
                            <div className="att-device" key={a.id}>
                              <strong>
                                {dateLabel(a.businessDate)} · {a.name}
                              </strong>
                              <span>
                                {a.startsAt
                                  ? `${new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: data.branch.timeZone }).format(new Date(a.startsAt))} – ${new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: data.branch.timeZone }).format(new Date(a.endsAt!))}`
                                  : "Franco"}
                              </span>
                            </div>
                          ))
                      ) : (
                        <p className="att-subtle">
                          No tenés horarios en el período consultado.
                        </p>
                      )}
                      <DateFilter
                        data={data}
                        onApply={setFilters}
                        busy={busy}
                      />
                    </section>
                  </>
                )}
                {tab === "register" && manager && (
                  <AttendanceRegister
                    data={data}
                    busy={busy}
                    command={execute}
                  />
                )}
                {tab === "manual" && manager && (
                  <ManualRequests data={data} busy={busy} command={execute} />
                )}
              </>
            )}
            {mode === "planning" && manager && (
              <>
                <div className="att-week-bar">
                  <Button
                    variant="outline"
                    aria-label="Semana anterior"
                    disabled={busy}
                    onClick={() =>
                      setFilters({
                        from: addDays(data.from, -7),
                        to: addDays(data.from, -1),
                      })
                    }
                  >
                    <ChevronLeft />
                  </Button>
                  <strong>
                    {dateLabel(data.from)} – {dateLabel(data.to)}
                  </strong>
                  <Button
                    variant="outline"
                    aria-label="Semana siguiente"
                    disabled={busy}
                    onClick={() =>
                      setFilters({
                        from: addDays(data.from, 7),
                        to: addDays(data.from, 13),
                      })
                    }
                  >
                    <ChevronRight />
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      const from = monday(data.today);
                      setFilters({ from, to: addDays(from, 6) });
                    }}
                  >
                    Esta semana
                  </Button>
                </div>
                <AttendancePlanning data={data} busy={busy} command={execute} />
              </>
            )}
            {mode === "settings" && (
              <AttendanceSettings data={data} busy={busy} command={execute} />
            )}
            {correction && (
              <CorrectionForm
                data={data}
                userId={actorId}
                busy={busy}
                command={execute}
                onClose={() => setCorrection(false)}
              />
            )}
          </>
        )}
        {devices && (
          <IdentityDevices
            branchId={branchId}
            onClose={() => setDevices(false)}
          />
        )}
      </div>
    </AttendanceErrorContext>
  );
}
function DateFilter({
  data,
  onApply,
  busy,
}: {
  data: Snapshot;
  onApply: (value: { from: string; to: string }) => void;
  busy: boolean;
}) {
  return (
    <form
      className="att-filter"
      key={data.from + data.to}
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget),
          from = String(form.get("from")),
          to = String(form.get("to"));
        if (from <= to && Date.parse(to) - Date.parse(from) <= 93 * 86400000)
          onApply({ from, to });
        else
          e.currentTarget
            .querySelector<HTMLInputElement>('[name="to"]')
            ?.setCustomValidity(
              "Elegí un período de hasta 93 días, posterior a la fecha inicial.",
            );
      }}
    >
      <Field label="Desde" required>
        <input type="date" name="from" required defaultValue={data.from} />
      </Field>
      <Field label="Hasta" required>
        <input
          type="date"
          name="to"
          required
          defaultValue={data.to}
          onChange={(e) => e.target.setCustomValidity("")}
        />
      </Field>
      <Button variant="outline" disabled={busy} className="min-h-11">
        Consultar período
      </Button>
    </form>
  );
}
function InstallInstructions() {
  return (
    <details className="att-install">
      <summary>Usar Kybo desde el celular</summary>
      <p>
        Abrí Kybo con HTTPS. En iPhone: Compartir → Agregar a inicio. En
        Android: menú del navegador → Instalar aplicación o Agregar a pantalla
        principal.
      </p>
      <p>
        Necesitás conexión para registrar una marca. Usá siempre tu cuenta
        personal.
      </p>
    </details>
  );
}
