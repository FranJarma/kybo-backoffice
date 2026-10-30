"use client";

import { useEffect, useState } from "react";
import { Plus, Copy, Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { privateRequest } from "@/components/identity/client";
import { localSchedule } from "@/modules/production/schedule-time";
import { addDays } from "@/modules/attendance/rules";
import {
  Drawer,
  Relation,
  Field,
  clock,
  dateLabel,
  type Snapshot,
  type Command,
} from "./shared";
export function AttendancePlanning({
  data,
  busy,
  command,
}: {
  data: Snapshot;
  busy: boolean;
  command: Command;
}) {
  const [edit, setEdit] = useState<{
      userId: string;
      day: string;
      id?: string;
    } | null>(null),
    [shift, setShift] = useState<string | null>(null),
    [copy, setCopy] = useState(false);
  const people = data.people.filter((p) => p.active && p.enabled),
    days = Array.from({ length: 7 }, (_, i) => addDays(data.from, i));
  return (
    <>
      <div className="att-section-bar">
        <div>
          <h2>Planificación semanal</h2>
          <p>
            Asigná horarios por persona y día. Podés agregar más de un tramo sin
            superponerlos.
          </p>
        </div>
        <Button variant="outline" disabled={busy} onClick={() => setCopy(true)}>
          <Copy />
          Copiar semana anterior
        </Button>
      </div>
      <section className="att-panel att-no-padding">
        <div className="att-table-wrap">
          <table className="att-calendar">
            <thead>
              <tr>
                <th>Equipo</th>
                {days.map((day) => (
                  <th key={day}>
                    {new Intl.DateTimeFormat("es-AR", {
                      weekday: "short",
                      timeZone: "UTC",
                    }).format(new Date(day + "T12:00:00Z"))}
                    <small>{dateLabel(day)}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {people.map((person) => (
                <tr key={person.id}>
                  <th>{person.name}</th>
                  {days.map((day) => (
                    <td key={day}>
                      {data.assignments
                        .filter(
                          (a) =>
                            a.userId === person.id && a.businessDate === day,
                        )
                        .map((a) => (
                          <button
                            className={`att-shift ${a.kind === "off" ? "off" : ""}`}
                            key={a.id}
                            onClick={() =>
                              setEdit({ userId: person.id, day, id: a.id })
                            }
                          >
                            <strong>{a.name}</strong>
                            {a.kind === "work" && (
                              <>
                                <span>
                                  {clock(a.startsAt, data.branch.timeZone)} –{" "}
                                  {clock(a.endsAt, data.branch.timeZone)}
                                </span>
                                <small>Pausa {a.pauseMinutes} min</small>
                              </>
                            )}
                          </button>
                        ))}
                      <button
                        aria-label={`Agregar horario para ${person.name}, ${dateLabel(day)}`}
                        className="att-add-shift"
                        onClick={() => setEdit({ userId: person.id, day })}
                      >
                        <Plus size={16} />
                      </button>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!people.length && (
          <div className="att-empty">
            <Clock3 />
            <strong>Habilitá al personal para empezar</strong>
            <p>
              Administración puede hacerlo desde Configuración de asistencia.
            </p>
          </div>
        )}
      </section>
      <section className="att-panel">
        <div className="att-section-bar">
          <div>
            <h2>Turnos habituales</h2>
            <p>
              Los cambios se aplican a nuevas asignaciones; los horarios ya
              guardados se conservan.
            </p>
          </div>
          <Button variant="outline" onClick={() => setShift("new")}>
            <Plus />
            Crear turno
          </Button>
        </div>
        <div className="att-shift-templates">
          {data.shifts.map((s) => (
            <button
              key={s.id}
              className="att-shift"
              onClick={() => setShift(s.id)}
            >
              <strong>
                {s.name}
                {!s.active ? " · Inactivo" : ""}
              </strong>
              <span>
                {s.start} – {s.end}
                {s.overnight ? " (+1 día)" : ""}
              </span>
              <small>Pausa {s.pauseMinutes} min</small>
            </button>
          ))}
        </div>
      </section>
      {edit && (
        <AssignmentForm
          key={edit.id ?? edit.userId + edit.day}
          data={data}
          edit={edit}
          command={command}
          busy={busy}
          onClose={() => setEdit(null)}
        />
      )}
      {shift && (
        <ShiftForm
          data={data}
          id={shift}
          command={command}
          busy={busy}
          onClose={() => setShift(null)}
        />
      )}
      {copy && (
        <CopyWeek
          data={data}
          busy={busy}
          command={command}
          onClose={() => setCopy(false)}
        />
      )}
    </>
  );
}
function CopyWeek({
  data,
  busy,
  command,
  onClose,
}: {
  data: Snapshot;
  busy: boolean;
  command: Command;
  onClose: () => void;
}) {
  const [source, setSource] = useState<Snapshot | null>(null),
    [error, setError] = useState("");
  const from = addDays(data.from, -7),
    to = addDays(data.from, -1);
  useEffect(() => {
    const abort = new AbortController();
    privateRequest<{ ready: boolean } & Snapshot>(
      `/api/attendance?${new URLSearchParams({ from, to })}`,
      data.branch.id,
      undefined,
      abort.signal,
    )
      .then((result) => {
        if (!result.ready)
          throw new Error("No pudimos consultar la semana anterior.");
        setSource(result);
      })
      .catch((e) => {
        if (!abort.signal.aborted) setError(e.message);
      });
    return () => abort.abort();
  }, [data.branch.id, from, to]);
  const candidates =
    source?.assignments
      .filter((a) =>
        data.people.some((p) => p.id === a.userId && p.enabled && p.active),
      )
      .map((a) => ({
        ...a,
        target: addDays(a.businessDate, 7),
        occupied:
          data.assignments.some(
            (other) =>
              other.userId === a.userId &&
              other.businessDate === addDays(a.businessDate, 7),
          ) ||
          data.events.some(
            (e) =>
              e.userId === a.userId &&
              e.businessDate === addDays(a.businessDate, 7),
          ),
      })) ?? [];
  return (
    <Drawer
      title="Copiar semana anterior"
      description="Vista previa. Se conservan los días que ya tienen horarios o fichajes y se vuelve a comprobar al guardar."
      onClose={onClose}
      busy={busy}
    >
      <p>
        Del {dateLabel(from)} al {dateLabel(to)} hacia la semana del{" "}
        {dateLabel(data.from)}.
      </p>
      {error && (
        <p role="alert" className="att-error">
          {error}
        </p>
      )}
      {!source && !error && <p>Cargando vista previa…</p>}
      {source && !candidates.length && (
        <p>No hay horarios habilitados para copiar.</p>
      )}
      {candidates.map((a) => (
        <div className="att-device" key={a.id}>
          <div>
            <strong>
              {data.people.find((p) => p.id === a.userId)?.name} ·{" "}
              {dateLabel(a.target)}
            </strong>
            <small>
              {a.name} ·{" "}
              {a.kind === "off"
                ? "Franco"
                : `${clock(a.startsAt, data.branch.timeZone)} – ${clock(a.endsAt, data.branch.timeZone)}`}
            </small>
          </div>
          <span>{a.occupied ? "Se conserva lo existente" : "Se agregará"}</span>
        </div>
      ))}
      <Button
        className="min-h-12 w-full"
        disabled={
          busy || !source || !!error || !candidates.some((a) => !a.occupied)
        }
        onClick={() =>
          void command({
            action: "copyWeek",
            sourceMonday: from,
            targetMonday: data.from,
          })
            .then(onClose)
            .catch(() => {})
        }
      >
        Copiar sobre días vacíos
      </Button>
    </Drawer>
  );
}
function AssignmentForm({
  data,
  edit,
  command,
  busy,
  onClose,
}: {
  data: Snapshot;
  edit: { userId: string; day: string; id?: string };
  command: Command;
  busy: boolean;
  onClose: () => void;
}) {
  const old = data.assignments.find((a) => a.id === edit.id),
    [userId, setUser] = useState(edit.userId),
    [day, setDay] = useState(edit.day),
    [kind, setKind] = useState<"work" | "off">(old?.kind ?? "work"),
    [shiftId, setShift] = useState(old?.shiftId ?? ""),
    [name, setName] = useState(old?.name ?? "Horario particular"),
    [start, setStart] = useState(
      old?.startsAt
        ? localSchedule(old.startsAt, data.branch.timeZone).slice(11)
        : "09:00",
    ),
    [end, setEnd] = useState(
      old?.endsAt
        ? localSchedule(old.endsAt, data.branch.timeZone).slice(11)
        : "17:00",
    ),
    [pause, setPause] = useState(old?.pauseMinutes ?? 30),
    [overnight, setOvernight] = useState(
      old?.endsAt
        ? localSchedule(old.endsAt, data.branch.timeZone).slice(0, 10) !==
            old.businessDate
        : false,
    ),
    [reason, setReason] = useState("");
  const hasPunch = data.events.some(
    (e) =>
      e.userId === userId &&
      (e.businessDate === day || e.businessDate === old?.businessDate),
  );
  function choose(id: string) {
    setShift(id);
    const s = data.shifts.find((s) => s.id === id);
    if (s) {
      setStart(s.start);
      setEnd(s.end);
      setPause(s.pauseMinutes);
      setOvernight(s.overnight);
      setName(s.name);
    }
  }
  return (
    <Drawer
      title={old ? "Editar horario" : "Asignar horario"}
      description="Horario y pausa previstos para esta persona y fecha."
      onClose={onClose}
      busy={busy}
    >
      <form
        className="att-stack"
        onSubmit={(e) => {
          e.preventDefault();
          void command({
            action: "assign",
            ...(old ? { id: old.id, expectedRevision: old.revision } : {}),
            userId,
            businessDate: day,
            kind,
            shiftId: shiftId || null,
            name,
            start,
            end,
            overnight,
            pauseMinutes: pause,
            reason,
          })
            .then(onClose)
            .catch(() => {});
        }}
      >
        <Relation
          label="Empleado"
          required
          options={data.people.filter((p) => p.enabled && p.active)}
          value={userId}
          onChange={setUser}
          disabled={!!old || busy}
        />
        <Field label="Fecha" required>
          <input
            type="date"
            required
            value={day}
            onChange={(e) => setDay(e.target.value)}
          />
        </Field>
        <div className="att-segmented">
          <button
            type="button"
            aria-pressed={kind === "work"}
            onClick={() => setKind("work")}
          >
            Horario de trabajo
          </button>
          <button
            type="button"
            aria-pressed={kind === "off"}
            onClick={() => setKind("off")}
          >
            Franco
          </button>
        </div>
        {kind === "work" && (
          <>
            <Relation
              label="Turno habitual"
              value={shiftId}
              options={data.shifts
                .filter((s) => s.active || s.id === old?.shiftId)
                .map((s) => ({
                  id: s.id,
                  name: s.name,
                  description: `${s.start} – ${s.end}`,
                }))}
              onChange={choose}
            />
            <Field label="Nombre del horario" required>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={60}
              />
            </Field>
            <div className="att-form-grid">
              <Field required label="Entrada">
                <input
                  type="time"
                  required
                  value={start}
                  onChange={(e) => setStart(e.target.value)}
                />
              </Field>
              <Field required label="Salida">
                <input
                  type="time"
                  required
                  value={end}
                  onChange={(e) => setEnd(e.target.value)}
                />
              </Field>
            </div>
            <label className="att-check">
              <input
                type="checkbox"
                checked={overnight}
                onChange={(e) => setOvernight(e.target.checked)}
              />
              La salida es al día siguiente
            </label>
            <Field label="Pausa para comer (minutos)" required>
              <input
                type="number"
                required
                min={0}
                max={1439}
                value={pause}
                onChange={(e) => setPause(Number(e.target.value))}
              />
            </Field>
          </>
        )}
        <Field
          label={old ? "Motivo del cambio" : "Aclaración"}
          required={hasPunch}
        >
          <textarea
            required={hasPunch}
            minLength={hasPunch ? 3 : undefined}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <Button className="min-h-12" disabled={busy}>
          Guardar horario
        </Button>
        {old && (
          <Button
            type="button"
            variant="outline"
            disabled={busy || reason.trim().length < 3}
            onClick={() =>
              void command({
                action: "cancelAssignment",
                id: old.id,
                expectedRevision: old.revision,
                reason,
              })
                .then(onClose)
                .catch(() => {})
            }
          >
            Quitar horario · requiere motivo
          </Button>
        )}
      </form>
    </Drawer>
  );
}
function ShiftForm({
  data,
  id,
  command,
  busy,
  onClose,
}: {
  data: Snapshot;
  id: string;
  command: Command;
  busy: boolean;
  onClose: () => void;
}) {
  const old = data.shifts.find((s) => s.id === id),
    [name, setName] = useState(old?.name ?? ""),
    [start, setStart] = useState(old?.start ?? "09:00"),
    [end, setEnd] = useState(old?.end ?? "17:00"),
    [pause, setPause] = useState(old?.pauseMinutes ?? 30),
    [overnight, setOvernight] = useState(old?.overnight ?? false),
    [active, setActive] = useState(old?.active ?? true);
  return (
    <Drawer
      title={old ? "Editar turno habitual" : "Crear turno habitual"}
      description="Usalo como base al planificar. Cada asignación conserva sus propios horarios."
      onClose={onClose}
      busy={busy}
    >
      <form
        className="att-stack"
        onSubmit={(e) => {
          e.preventDefault();
          void command({
            action: "saveShift",
            ...(old ? { id: old.id, expectedRevision: old.revision } : {}),
            name,
            start,
            end,
            pauseMinutes: pause,
            overnight,
            active,
          })
            .then(onClose)
            .catch(() => {});
        }}
      >
        <Field required label="Nombre">
          <input
            autoFocus
            required
            maxLength={60}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <div className="att-form-grid">
          <Field required label="Entrada">
            <input
              type="time"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </Field>
          <Field required label="Salida">
            <input
              type="time"
              required
              value={end}
              onChange={(e) => setEnd(e.target.value)}
            />
          </Field>
        </div>
        <label className="att-check">
          <input
            type="checkbox"
            checked={overnight}
            onChange={(e) => setOvernight(e.target.checked)}
          />
          Salida al día siguiente
        </label>
        <Field required label="Pausa para comer (minutos)">
          <input
            type="number"
            required
            min={0}
            max={1439}
            value={pause}
            onChange={(e) => setPause(Number(e.target.value))}
          />
        </Field>
        <label className="att-check">
          <input
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
          />
          Turno disponible para nuevas asignaciones
        </label>
        <Button className="min-h-12" disabled={busy}>
          Guardar turno
        </Button>
      </form>
    </Drawer>
  );
}
