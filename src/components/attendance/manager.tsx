"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Fingerprint,
  RefreshCw,
  Settings2,
  ChevronLeft,
  ChevronRight,
  ScanLine,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
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
  clock,
  dateLabel,
  AttendanceErrorContext,
  AttendanceReadOnlyContext,
  type Snapshot,
} from "./shared";
import type { AttendanceCommand } from "@/modules/attendance/validation";
import { addDays } from "@/modules/attendance/rules";
import { AttendanceAttempts } from "./attempts";
import { useAttendanceQrAttempt } from "./use-qr-attempt";
import { attendanceQrPath } from "@/modules/attendance/qr-link";
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
  const router = useRouter();
  const [verificationReady, setVerificationReady] = useState(
    mode !== "attendance" || !qrCode,
  );
  const qr = useAttendanceQrAttempt(
    branchId,
    mode === "attendance" && verificationReady ? qrCode : undefined,
  );
  const [response, setResponse] = useState<Response | null>(null),
    [loading, setLoading] = useState(true),
    [readError, setReadError] = useState(""),
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
  useEffect(() => {
    if (mode !== "attendance" || !qrCode) return;
    const abort = new AbortController();
    void privateRequest<{ ready: boolean; credentials: { id: string }[] }>(
      "/api/identity",
      branchId,
      undefined,
      abort.signal,
    )
      .then((result) => {
        if (abort.signal.aborted) return;
        if (!result.ready)
          throw new Error(
            "Administración debe habilitar la verificación del celular antes de fichar.",
          );
        if (result.credentials.length) setVerificationReady(true);
        else
          router.replace(
            `/onboarding?returnTo=${encodeURIComponent(attendanceQrPath(qrCode))}`,
          );
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => abort.abort();
  }, [branchId, mode, qrCode, router]);
  const query = filters ? `?${new URLSearchParams(filters)}` : "";
  const load = useCallback(
    async (signal?: AbortSignal, background = false) => {
      const current = ++revision.current;
      if (!background) {
        setLoading(true);
        setReadError("");
      }
      try {
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
        setReadError("");
      } catch (cause) {
        if (current === revision.current && !signal?.aborted)
          setReadError(
            cause instanceof Error
              ? cause.message
              : "No pudimos consultar la asistencia.",
          );
        throw cause;
      } finally {
        if (current === revision.current && !signal?.aborted) setLoading(false);
      }
    },
    [branchId, query, mode, filters],
  );
  useEffect(() => {
    const abort = new AbortController();
    let refreshing = false;
    const refresh = async (background = false) => {
      if (refreshing || active.current || document.visibilityState === "hidden")
        return;
      refreshing = true;
      try {
        await load(abort.signal, background);
      } catch {
        // Read feedback belongs to the query, separate from command errors.
      } finally {
        refreshing = false;
      }
    };
    void refresh();
    const onFocus = () => void refresh(true);
    const interval = setInterval(() => void refresh(true), 25000);
    window.addEventListener("focus", onFocus);
    return () => {
      abort.abort();
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [load]);
  const rangeMismatch = !!(
    response?.ready &&
    filters &&
    (response.from !== filters.from || response.to !== filters.to)
  );
  const reading = loading || rangeMismatch;
  const readLocked = reading || !!readError;
  function changeFilters(value: { from: string; to: string }) {
    if (active.current) return;
    ++revision.current;
    setLoading(true);
    setReadError("");
    setFilters(value);
  }
  async function execute(
    command: AttendanceCommand,
    prepare?: (requestId: string) => Promise<AttendanceCommand>,
  ): Promise<Result> {
    if (active.current)
      throw new Error("Esperá a que termine la operación actual.");
    if (readLocked) {
      const message = "Actualizá los datos antes de guardar una operación.";
      setError(message);
      throw new Error(message);
    }
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
            : command.action === "assignPeriod"
              ? `${result.created ?? 0} horarios agregados. ${result.skipped ?? 0} fechas conservadas.`
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
        const location =
          response?.ready && response.settings?.requireLocation === false
            ? null
            : await currentLocation();
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
  if (mode === "attendance" && qrCode && !verificationReady)
    return (
      <section className="att-page">
        {error ? (
          <div className="att-panel">
            <p role="alert" className="att-error">
              {error}
            </p>
            <Button variant="outline" onClick={() => window.location.reload()}>
              Reintentar
            </Button>
          </div>
        ) : (
          <p className="att-panel" role="status">
            Comprobando la verificación del celular…
          </p>
        )}
      </section>
    );
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
  const weekFrom = filters?.from ?? data?.from ?? "";
  const weekTo = filters?.to ?? data?.to ?? "";
  return (
    <AttendanceErrorContext value={readError || error}>
      <AttendanceReadOnlyContext value={readLocked}>
        <div
          className={`att-page att-mode-${mode}${personal ? " att-personal-mode" : ""}`}
        >
          <div className="att-page-heading">
            <div>
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
                disabled={busy || loading}
                onClick={() => {
                  setError("");
                  void load().catch(() => {});
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
          {readError && (
            <div role="alert" className="att-error att-read-feedback">
              <span>
                {readError}
                {data
                  ? " Los datos anteriores quedan visibles; actualizá antes de editar."
                  : ""}
              </span>
              <Button
                variant="outline"
                disabled={busy || loading}
                onClick={() => void load().catch(() => {})}
              >
                Reintentar consulta
              </Button>
            </div>
          )}
          {data && reading && !readError && (
            <p role="status" className="att-read-progress">
              {mode === "planning"
                ? "Cargando horarios…"
                : "Actualizando asistencia…"}
            </p>
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
          {!response && loading && (
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
            <fieldset
              className="att-ready-content"
              disabled={readLocked}
              aria-busy={reading && !readError}
            >
              {mode === "attendance" && (
                <Tabs.Root value={tab} onValueChange={setTab}>
                  <Tabs.List
                    className="att-tabs"
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
                      <Tabs.Trigger key={id} value={id} disabled={busy}>
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
                      </Tabs.Trigger>
                    ))}
                  </Tabs.List>
                  <Tabs.Content value={tab}>
                    {tab === "register" && (
                      <DateFilter
                        data={data}
                        onApply={changeFilters}
                        busy={busy || reading}
                      />
                    )}
                    {tab === "personal" && (
                      <>
                        <PersonalAttendance
                          data={data}
                          busy={busy}
                          canPunch={!readLocked && !!qr.attempt && !qr.opening}
                          qrStatus={
                            <div
                              className={`att-qr-access ${qr.error ? "att-error" : ""}`}
                              role={qr.error ? "alert" : "status"}
                            >
                              <ScanLine size={20} aria-hidden="true" />
                              <div>
                                <strong>
                                  {qr.opening
                                    ? "Validando el QR del local…"
                                    : qr.attempt
                                      ? "QR del local recibido"
                                      : "Escaneá el QR del local"}
                                </strong>
                                {(!qr.attempt || qr.error) && (
                                  <p>
                                    {qr.error ||
                                      "Lo encontrás en la PC o tablet. Necesitás un QR vigente para cada entrada, pausa o salida."}
                                  </p>
                                )}
                              </div>
                            </div>
                          }
                          onPunch={punch}
                        />
                        <div className="att-personal-footer">
                          <Button
                            variant="ghost"
                            disabled={busy || readLocked}
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
                                      ? `${clock(a.startsAt, data.branch.timeZone)} – ${clock(a.endsAt, data.branch.timeZone)}`
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
                            onApply={changeFilters}
                            busy={busy || reading}
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
                      <ManualRequests
                        data={data}
                        busy={busy}
                        command={execute}
                      />
                    )}
                  </Tabs.Content>
                </Tabs.Root>
              )}
              {mode === "planning" && manager && (
                <AttendancePlanning
                  data={data}
                  busy={busy}
                  command={execute}
                  navigation={
                    <div className="att-week-bar">
                      <Button
                        variant="outline"
                        aria-label="Semana anterior"
                        disabled={busy || loading}
                        onClick={() =>
                          changeFilters({
                            from: addDays(weekFrom, -7),
                            to: addDays(weekFrom, -1),
                          })
                        }
                      >
                        <ChevronLeft />
                      </Button>
                      <strong>
                        {dateLabel(weekFrom)} – {dateLabel(weekTo)}
                      </strong>
                      <Button
                        variant="outline"
                        aria-label="Semana siguiente"
                        disabled={busy || loading}
                        onClick={() =>
                          changeFilters({
                            from: addDays(weekFrom, 7),
                            to: addDays(weekFrom, 13),
                          })
                        }
                      >
                        <ChevronRight />
                      </Button>
                      <Button
                        variant="ghost"
                        disabled={busy || loading}
                        onClick={() => {
                          const from = monday(data.today);
                          changeFilters({ from, to: addDays(from, 6) });
                        }}
                      >
                        Esta semana
                      </Button>
                    </div>
                  }
                />
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
            </fieldset>
          )}
          {devices && (
            <IdentityDevices
              branchId={branchId}
              onClose={() => setDevices(false)}
            />
          )}
        </div>
      </AttendanceReadOnlyContext>
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
