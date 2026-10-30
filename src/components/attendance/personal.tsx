"use client";

import {
  Fingerprint,
  MapPin,
  LogIn,
  LogOut,
  Coffee,
  Play,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Badge,
  clock,
  dateLabel,
  minutes,
  kindLabel,
  type Snapshot,
} from "./shared";
export function PersonalAttendance({
  data,
  busy,
  onPunch,
}: {
  data: Snapshot;
  busy: boolean;
  onPunch: (
    kind: "entry" | "pause" | "resume" | "exit",
    assignmentId?: string,
  ) => Promise<void>;
}) {
  const own = data.people.find((p) => p.id === data.actor.id),
    state = data.current.state;
  const ownEvents =
    data.ownJournal?.events ??
    data.events.filter((e) => e.userId === data.actor.id);
  const scheduled =
    (state === "out" && data.entryAssignments?.length
      ? data.entryAssignments
      : data.ownJournal?.assignments) ??
    data.assignments.filter(
      (a) => a.userId === data.actor.id && a.businessDate === data.today,
    );
  const shifts = scheduled.filter((a) => a.kind === "work");
  const total = data.ownJournal?.total ?? data.totals[data.actor.id];
  const requests = data.corrections.filter((r) => r.userId === data.actor.id);
  const disabled =
    busy ||
    !data.settings?.enabled ||
    !own?.enabled ||
    (state !== "out" && data.current.branchId !== data.branch.id);
  return (
    <div className="att-personal">
      <section className="att-clock-card">
        <div className="att-eyebrow">
          {dateLabel(data.today)} · {data.branch.name}
        </div>
        <div className="att-clock-heading">
          <h2>Hola, {data.actor.name.split(" ")[0]}</h2>
          <Badge
            tone={
              state === "working"
                ? "green"
                : state === "pause"
                  ? "orange"
                  : "muted"
            }
          >
            {state === "working"
              ? "En jornada"
              : state === "pause"
                ? "En pausa"
                : "Fuera de jornada"}
          </Badge>
        </div>
        <p>
          {state === "out"
            ? "Registrá tu entrada cuando estés en el local."
            : state === "pause"
              ? "Tu pausa sigue abierta. Marcá su fin al volver."
              : "Tu entrada quedó registrada. Marcá las pausas y la salida desde acá."}
        </p>
        <div className="att-today-shift">
          <span>
            {state === "out" && shifts.length > 1
              ? "Elegí el horario que vas a comenzar"
              : data.ownJournal?.businessDate &&
                  data.ownJournal.businessDate !== data.today
                ? `Jornada del ${dateLabel(data.ownJournal.businessDate)}`
                : "Tu horario de hoy"}
          </span>
          {scheduled.length ? (
            scheduled.map((a) => (
              <strong key={a.id}>
                {a.kind === "off"
                  ? "Franco"
                  : `${clock(a.startsAt, data.branch.timeZone)} – ${clock(a.endsAt, data.branch.timeZone)} · Pausa ${a.pauseMinutes} min`}
              </strong>
            ))
          ) : (
            <strong>Sin horario asignado</strong>
          )}
        </div>
        {state === "out" && shifts.length > 1 ? (
          <div className="att-stack">
            {shifts.map((a) => (
              <Button
                key={a.id}
                disabled={disabled}
                className="att-main-action"
                onClick={() => void onPunch("entry", a.id)}
              >
                <LogIn />
                Registrar entrada · {dateLabel(a.businessDate)}{" "}
                {clock(a.startsAt, data.branch.timeZone)}
              </Button>
            ))}
          </div>
        ) : (
          <Button
            className="att-main-action"
            disabled={disabled}
            onClick={() =>
              void onPunch(
                state === "out"
                  ? "entry"
                  : state === "pause"
                    ? "resume"
                    : "pause",
                state === "out" ? shifts[0]?.id : undefined,
              )
            }
          >
            {state === "out" ? (
              <LogIn />
            ) : state === "pause" ? (
              <Play />
            ) : (
              <Coffee />
            )}
            {busy
              ? "Verificando…"
              : state === "out"
                ? "Registrar entrada"
                : state === "pause"
                  ? "Finalizar pausa"
                  : "Comenzar pausa"}
          </Button>
        )}
        {state !== "out" && (
          <Button
            variant="outline"
            className="min-h-12 w-full"
            disabled={disabled}
            onClick={() => void onPunch("exit")}
          >
            <LogOut />
            {state === "pause"
              ? "Finalizar pausa y registrar salida"
              : "Registrar salida"}
          </Button>
        )}
        {!data.settings?.enabled && (
          <p className="att-notice">
            Administración debe habilitar el fichaje de esta sucursal.
          </p>
        )}
        {data.settings?.enabled && !own?.enabled && (
          <p className="att-notice">
            Administración debe habilitar tu participación para que puedas
            fichar.
          </p>
        )}
        {state !== "out" && data.current.branchId !== data.branch.id && (
          <p className="att-notice">
            Tenés una entrada abierta en otra sucursal. Seleccioná esa sucursal
            para continuar.
          </p>
        )}
        <div className="att-verification-note">
          <Fingerprint size={20} />
          <span>
            <strong>Verificación del celular</strong>
            <small>
              Podés usar Face ID o huella; tu celular también puede ofrecer su
              código de desbloqueo.
            </small>
          </span>
        </div>
        <div className="att-verification-note">
          <MapPin size={20} />
          <span>
            <strong>Ubicación al fichar</strong>
            <small>Se verifica tu cercanía al local en cada marca.</small>
          </span>
        </div>
      </section>
      <section className="att-panel">
        <div className="att-panel-title">
          <h2>Mi jornada</h2>
          <ShieldCheck size={20} />
        </div>
        <div className="att-metrics">
          <div>
            <small>Tiempo sin pausas</small>
            <strong>{minutes(total?.netMinutes)}</strong>
          </div>
          <div>
            <small>Pausas</small>
            <strong>{minutes(total?.pauseMinutes)}</strong>
          </div>
        </div>
        {total?.provisional && (
          <p className="att-subtle">
            Tiempo provisional: hay una entrada abierta.
          </p>
        )}
        {ownEvents.length ? (
          <ol className="att-timeline">
            {ownEvents.map((e) => (
              <li key={e.id}>
                <span className="att-timeline-dot" />
                <div>
                  <strong>{kindLabel[e.kind as keyof typeof kindLabel]}</strong>
                  <small>
                    {dateLabel(e.businessDate)} ·{" "}
                    {e.source === "manual"
                      ? "Manual autorizado"
                      : "Identidad y ubicación verificadas"}
                    {e.correctionId ? " · Corregido" : ""}
                  </small>
                </div>
                <time>{clock(e.occurredAt, data.branch.timeZone)}</time>
              </li>
            ))}
          </ol>
        ) : (
          <div className="att-empty">
            <Fingerprint size={30} />
            <strong>Todavía no hay fichajes en este período</strong>
            <p>Las marcas confirmadas aparecerán acá.</p>
          </div>
        )}
        {requests.length > 0 && (
          <details className="att-details">
            <summary>Mis solicitudes de corrección ({requests.length})</summary>
            {requests.map((request) => (
              <div className="att-device" key={request.id}>
                <div>
                  <strong>{request.reason}</strong>
                  <small>
                    {request.resolutionReason || "A la espera de una revisión"}
                  </small>
                </div>
                <Badge>
                  {request.status === "pending"
                    ? "Pendiente"
                    : request.status === "approved"
                      ? "Aprobada"
                      : "Rechazada"}
                </Badge>
              </div>
            ))}
          </details>
        )}
      </section>
    </div>
  );
}
