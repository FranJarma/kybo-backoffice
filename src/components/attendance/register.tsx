"use client";

import { useState } from "react";
import { Download, Pencil, ListChecks } from "lucide-react";
import { Button } from "@/components/ui/button";
import { compareAssignment, summarizeDays } from "@/modules/attendance/reports";
import {
  localSchedule,
  scheduleInstant,
} from "@/modules/production/schedule-time";
import {
  Badge,
  Drawer,
  Relation,
  Field,
  clock,
  dateLabel,
  minutes,
  kindLabel,
  nameOf,
  type Snapshot,
  type Command,
} from "./shared";
function csvCell(value: unknown) {
  const s = String(value ?? "");
  return '"' + (/^[=+@\-]/.test(s) ? "'" + s : s).replace(/"/g, '""') + '"';
}
export function AttendanceRegister({
  data,
  command,
  busy,
}: {
  data: Snapshot;
  command: Command;
  busy: boolean;
}) {
  const [person, setPerson] = useState<string | null>(null),
    [correction, setCorrection] = useState<string | null>(null),
    [review, setReview] = useState<string | null>(null),
    [reason, setReason] = useState("");
  const [filterPerson, setFilterPerson] = useState("");
  const rows = data.people.filter(
    (p) =>
      (!filterPerson || p.id === filterPerson) &&
      (p.enabled || data.events.some((e) => e.userId === p.id)),
  );
  const days = rows.flatMap((p) =>
    [
      ...new Set([
        ...data.events
          .filter((e) => e.userId === p.id)
          .map((e) => e.businessDate),
        ...data.assignments
          .filter((a) => a.userId === p.id)
          .map((a) => a.businessDate),
      ]),
    ]
      .sort()
      .map((day) => ({
        person: p,
        day,
        events: data.events.filter(
          (e) => e.userId === p.id && e.businessDate === day,
        ),
        assignments: data.assignments.filter(
          (a) => a.userId === p.id && a.businessDate === day,
        ),
      })),
  );
  function download() {
    const values = [
      ["Empleado", "Jornada", "Marca", "Fecha y hora", "Origen", "Corregido"],
      ...data.events
        .filter((e) => !filterPerson || e.userId === filterPerson)
        .map((e) => [
          nameOf(data, e.userId),
          e.businessDate,
          kindLabel[e.kind as keyof typeof kindLabel],
          localSchedule(e.occurredAt, data.branch.timeZone),
          e.source === "phone"
            ? "Dispositivo y ubicación"
            : "Manual autorizado",
          e.correctionId ? "Sí" : "No",
        ]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        [
          "\uFEFF" +
            values.map((row) => row.map(csvCell).join(";")).join("\r\n"),
        ],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `asistencia-${data.from}-${data.to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const selected = person ? data.people.find((p) => p.id === person) : null;
  const request = data.corrections.find((r) => r.id === review);
  return (
    <>
      <div className="att-section-bar">
        <div>
          <h2>Registro del equipo</h2>
          <p>
            Entradas, salidas y pausas · {dateLabel(data.from)} al{" "}
            {dateLabel(data.to)}
          </p>
        </div>
        <Button
          variant="outline"
          disabled={!data.events.length}
          onClick={download}
        >
          <Download />
          Exportar fichajes
        </Button>
      </div>
      <div className="att-filter">
        <Relation
          label="Empleado"
          options={data.people}
          value={filterPerson}
          onChange={setFilterPerson}
        />
      </div>
      <section className="att-panel att-no-padding">
        <div className="att-table-wrap">
          <table className="att-table">
            <thead>
              <tr>
                <th>Empleado / jornada</th>
                <th>Horario previsto</th>
                <th>Entrada</th>
                <th>Salida</th>
                <th>Sin pausas / pausas</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {days.map((row) => {
                const entry = row.events.find((e) => e.kind === "entry"),
                  exit = row.events.at(-1);
                const total = summarizeDays(row.events, new Date(data.now));
                const review = row.assignments.some(
                  (a) =>
                    a.kind === "work" &&
                    compareAssignment(row.events, a, new Date(data.now))
                      .needsReview,
                );
                return (
                  <tr key={row.person.id + row.day}>
                    <td>
                      <strong>{row.person.name}</strong>
                      <small>{dateLabel(row.day)}</small>
                    </td>
                    <td>
                      {row.assignments.length
                        ? row.assignments.map((a) => (
                            <span className="att-line" key={a.id}>
                              {a.kind === "off"
                                ? "Franco"
                                : `${clock(a.startsAt, data.branch.timeZone)} – ${clock(a.endsAt, data.branch.timeZone)}`}
                            </span>
                          ))
                        : "Sin planificación"}
                    </td>
                    <td>{clock(entry?.occurredAt, data.branch.timeZone)}</td>
                    <td>
                      {clock(
                        exit?.kind === "exit" ? exit.occurredAt : null,
                        data.branch.timeZone,
                      )}
                    </td>
                    <td>
                      <strong>{minutes(total.netMinutes)}</strong>
                      <small>
                        Pausas {minutes(total.pauseMinutes)}
                        {total.provisional ? " · Provisional" : ""}
                      </small>
                    </td>
                    <td>
                      <Badge
                        tone={
                          !entry
                            ? "muted"
                            : exit?.kind === "exit"
                              ? "green"
                              : "orange"
                        }
                      >
                        {!entry
                          ? "Sin fichaje"
                          : exit?.kind === "exit"
                            ? "Finalizada"
                            : exit?.kind === "pause"
                              ? "En pausa"
                              : "Entrada abierta"}
                      </Badge>
                      {(review ||
                        (entry &&
                          !row.assignments.some((a) => a.kind === "work"))) && (
                        <small>
                          Revisar ·{" "}
                          {review
                            ? "Horario terminado sin cierre completo"
                            : "Sin horario vinculado"}
                        </small>
                      )}
                    </td>
                    <td>
                      <Button
                        variant="ghost"
                        onClick={() => setPerson(row.person.id)}
                      >
                        Ver detalle
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {!days.length && (
          <div className="att-empty">
            <ListChecks />
            <strong>Sin actividad en este período</strong>
            <p>Elegí otras fechas o empezá por planificar los horarios.</p>
          </div>
        )}
      </section>
      <section className="att-panel">
        <h2>Correcciones para revisar</h2>
        {data.corrections.length ? (
          [...data.corrections].reverse().map((r) => (
            <button
              key={r.id}
              className="att-request-row"
              onClick={() => {
                setReview(r.id);
                setReason("");
              }}
            >
              <Pencil size={18} />
              <div>
                <strong>{nameOf(data, r.userId)}</strong>
                <small>{r.reason}</small>
              </div>
              <Badge>
                {r.status === "pending"
                  ? "Pendiente"
                  : r.status === "approved"
                    ? "Aprobada"
                    : "Rechazada"}
              </Badge>
            </button>
          ))
        ) : (
          <p className="att-subtle">No hay correcciones solicitadas.</p>
        )}
      </section>
      {selected && (
        <Drawer
          title={selected.name}
          description="El historial original se conserva aunque se apruebe una corrección."
          onClose={() => setPerson(null)}
        >
          <div className="att-metrics">
            <div>
              <small>Tiempo sin pausas</small>
              <strong>{minutes(data.totals[selected.id]?.netMinutes)}</strong>
            </div>
            <div>
              <small>Pausas</small>
              <strong>{minutes(data.totals[selected.id]?.pauseMinutes)}</strong>
            </div>
            <div>
              <small>Entre salida y siguiente entrada</small>
              <strong>
                {minutes(data.totals[selected.id]?.interruptionsMinutes)}
              </strong>
            </div>
          </div>
          <p className="att-subtle">
            Son tiempos del período seleccionado. Los intervalos abiertos son
            provisionales y no miden productividad.
          </p>
          {data.assignments
            .filter((a) => a.userId === selected.id && a.kind === "work")
            .map((a) => {
              const comparison = compareAssignment(
                data.events,
                a,
                new Date(data.now),
              );
              return (
                <div className="att-correction" key={a.id}>
                  <strong>
                    {dateLabel(a.businessDate)} · {a.name}
                  </strong>
                  <p>
                    Previsto: {clock(a.startsAt, data.branch.timeZone)} –{" "}
                    {clock(a.endsAt, data.branch.timeZone)} · Pausa{" "}
                    {a.pauseMinutes} min
                  </p>
                  <p>
                    Desvío de entrada: {deviation(comparison.entryDifference)} ·
                    Salida: {deviation(comparison.exitDifference)} · Pausa:{" "}
                    {deviation(comparison.pauseDifference)}
                  </p>
                  {comparison.total.provisional && (
                    <small>
                      Comparación provisional: la jornada sigue abierta.
                    </small>
                  )}
                  <small>
                    Horario modificado por {nameOf(data, a.updatedBy)} ·{" "}
                    {dateLabel(
                      localSchedule(a.updatedAt, data.branch.timeZone),
                    )}{" "}
                    {clock(a.updatedAt, data.branch.timeZone)}
                  </small>
                </div>
              );
            })}
          {data.events
            .filter((e) => e.userId === selected.id)
            .map((e) => (
              <div className="att-device" key={e.id}>
                <div>
                  <strong>
                    {kindLabel[e.kind as keyof typeof kindLabel]} ·{" "}
                    {clock(e.occurredAt, data.branch.timeZone)}
                  </strong>
                  <small>
                    {dateLabel(e.businessDate)} ·{" "}
                    {e.source === "phone"
                      ? "Ubicación verificada"
                      : "Manual autorizado"}
                    {e.correctionId
                      ? ` · Original: ${clock(e.originalOccurredAt, data.branch.timeZone)}`
                      : ""}
                  </small>
                </div>
              </div>
            ))}
          <details className="att-details">
            <summary>Ver fichajes originales</summary>
            {data.originalEvents
              ?.filter((e) => e.userId === selected.id)
              .map((e) => (
                <div className="att-device" key={e.id}>
                  <div>
                    <strong>
                      {kindLabel[e.kind as keyof typeof kindLabel]} ·{" "}
                      {clock(e.occurredAt, data.branch.timeZone)}
                    </strong>
                    <small>
                      {dateLabel(e.businessDate)} ·{" "}
                      {e.source === "manual"
                        ? "Manual autorizado"
                        : "Verificación desde el dispositivo"}
                      {!data.events.some((current) => current.id === e.id)
                        ? " · Anulado en la vista actual"
                        : ""}
                    </small>
                    <small>
                      Recibido:{" "}
                      {localSchedule(
                        e.recordedAt,
                        data.branch.timeZone,
                      ).replace("T", " · ")}
                    </small>
                  </div>
                </div>
              ))}
          </details>
          <Button
            variant="outline"
            onClick={() => {
              setCorrection(selected.id);
              setPerson(null);
            }}
          >
            <Pencil />
            Solicitar corrección
          </Button>
          <LinkAssignment
            data={data}
            userId={selected.id}
            busy={busy}
            command={command}
          />
        </Drawer>
      )}
      {correction && (
        <CorrectionForm
          data={data}
          userId={correction}
          busy={busy}
          command={command}
          onClose={() => setCorrection(null)}
        />
      )}
      {request && (
        <Drawer
          title="Revisar corrección"
          description={`${nameOf(data, request.userId)} · ${request.status === "pending" ? "Pendiente" : "Resuelta"}`}
          onClose={() => setReview(null)}
          busy={busy}
        >
          <p>{request.reason}</p>
          <p className="att-subtle">
            Solicitó: {nameOf(data, request.requestedBy)}
          </p>
          {request.changes.map((change) => (
            <div className="att-device" key={change.eventId}>
              <span>
                {kindLabel[
                  data.events.find((e) => e.id === change.eventId)
                    ?.kind as keyof typeof kindLabel
                ] ?? "Marca original"}
              </span>
              <strong>
                {change.occurredAt
                  ? localSchedule(
                      change.occurredAt,
                      data.branch.timeZone,
                    ).replace("T", " · ")
                  : "Anular marca"}
              </strong>
            </div>
          ))}
          {request.preview && (
            <div className="att-correction">
              <h3>Efecto sobre las jornadas afectadas</h3>
              {request.preview.error ? (
                <p className="att-error">{request.preview.error}</p>
              ) : (
                <>
                  <p>
                    Sin pausas: {minutes(request.preview.before?.netMinutes)} →{" "}
                    {minutes(request.preview.after?.netMinutes)}
                  </p>
                  <p>
                    Pausas: {minutes(request.preview.before?.pauseMinutes)} →{" "}
                    {minutes(request.preview.after?.pauseMinutes)}
                  </p>
                  {request.preview.changes.map((change) => (
                    <small className="att-line" key={change.eventId}>
                      {kindLabel[change.kind]}:{" "}
                      {localSchedule(
                        change.before,
                        data.branch.timeZone,
                      ).replace("T", " · ")}{" "}
                      →{" "}
                      {change.after
                        ? localSchedule(
                            change.after,
                            data.branch.timeZone,
                          ).replace("T", " · ")
                        : "Anulada"}
                    </small>
                  ))}
                </>
              )}
            </div>
          )}
          {request.status === "pending" &&
          request.requestedBy !== data.actor.id ? (
            <div className="att-stack">
              <Field required label="Motivo de la resolución">
                <textarea
                  minLength={3}
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
              <Button
                disabled={
                  busy || reason.trim().length < 3 || !!request.preview?.error
                }
                onClick={() =>
                  void command({
                    action: "resolveCorrection",
                    id: request.id,
                    approve: true,
                    reason,
                  })
                    .then(() => setReview(null))
                    .catch(() => {})
                }
              >
                Aprobar corrección
              </Button>
              <Button
                variant="outline"
                disabled={busy || reason.trim().length < 3}
                onClick={() =>
                  void command({
                    action: "resolveCorrection",
                    id: request.id,
                    approve: false,
                    reason,
                  })
                    .then(() => setReview(null))
                    .catch(() => {})
                }
              >
                Rechazar
              </Button>
            </div>
          ) : (
            <p className="att-subtle">
              {request.resolutionReason ||
                "La solicitud debe resolverla otra persona autorizada."}
            </p>
          )}
        </Drawer>
      )}
    </>
  );
}
function deviation(value: number | null) {
  return value === null
    ? "Sin datos"
    : `${value > 0 ? "+" : ""}${Math.round(value * 100) / 100} min`;
}
export function CorrectionForm({
  data,
  userId,
  busy,
  command,
  onClose,
}: {
  data: Snapshot;
  userId: string;
  busy: boolean;
  command: Command;
  onClose: () => void;
}) {
  const [changes, setChanges] = useState<Record<string, string | null>>({}),
    [reason, setReason] = useState("");
  const rows = data.events.filter((e) => e.userId === userId);
  return (
    <Drawer
      title="Solicitar corrección"
      description="Podés editar o anular marcas existentes. Las marcas faltantes requieren un fichaje manual autorizado."
      onClose={onClose}
      busy={busy}
    >
      <form
        className="att-stack"
        onSubmit={(e) => {
          e.preventDefault();
          void command({
            action: "requestCorrection",
            userId,
            changes: Object.entries(changes).map(([eventId, value]) => ({
              eventId,
              occurredAt:
                value === null
                  ? null
                  : scheduleInstant(value, data.branch.timeZone),
            })),
            reason,
          })
            .then(onClose)
            .catch(() => {});
        }}
      >
        {rows.map((row) => (
          <div className="att-correction" key={row.id}>
            <label className="att-check">
              <input
                type="checkbox"
                checked={row.id in changes}
                onChange={(e) =>
                  setChanges((old) => {
                    const next = { ...old };
                    if (e.target.checked)
                      next[row.id] = localSchedule(
                        row.occurredAt,
                        data.branch.timeZone,
                      );
                    else delete next[row.id];
                    return next;
                  })
                }
              />
              {kindLabel[row.kind as keyof typeof kindLabel]} ·{" "}
              {dateLabel(row.businessDate)} ·{" "}
              {clock(row.occurredAt, data.branch.timeZone)}
            </label>
            {row.id in changes && (
              <>
                <label className="att-check">
                  <input
                    type="checkbox"
                    checked={changes[row.id] === null}
                    onChange={(e) =>
                      setChanges((old) => ({
                        ...old,
                        [row.id]: e.target.checked
                          ? null
                          : localSchedule(row.occurredAt, data.branch.timeZone),
                      }))
                    }
                  />
                  Anular esta marca
                </label>
                {changes[row.id] !== null && (
                  <Field label="Nueva fecha y hora" required>
                    <input
                      type="datetime-local"
                      required
                      value={changes[row.id] ?? ""}
                      onChange={(e) =>
                        setChanges((old) => ({
                          ...old,
                          [row.id]: e.target.value,
                        }))
                      }
                    />
                  </Field>
                )}
              </>
            )}
          </div>
        ))}
        <Field required label="Motivo">
          <textarea
            required
            minLength={3}
            maxLength={1000}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <Button
          disabled={busy || !Object.keys(changes).length}
          className="min-h-12"
        >
          Enviar corrección para revisión
        </Button>
      </form>
    </Drawer>
  );
}
function LinkAssignment({
  data,
  userId,
  busy,
  command,
}: {
  data: Snapshot;
  userId: string;
  busy: boolean;
  command: Command;
}) {
  const [entryId, setEntry] = useState(""),
    [assignmentId, setAssignment] = useState(""),
    [reason, setReason] = useState("");
  const entries = data.events.filter(
    (e) => e.userId === userId && e.kind === "entry",
  );
  return (
    <details className="att-details">
      <summary>Vincular entrada con un horario</summary>
      <form
        className="att-stack"
        onSubmit={(e) => {
          e.preventDefault();
          void command({
            action: "linkAssignment",
            entryId,
            assignmentId,
            reason,
          })
            .then(() => {
              setEntry("");
              setAssignment("");
              setReason("");
            })
            .catch(() => {});
        }}
      >
        <Relation
          label="Entrada"
          required
          value={entryId}
          onChange={setEntry}
          options={entries.map((e) => ({
            id: e.id,
            name: `${dateLabel(e.businessDate)} · ${clock(e.occurredAt, data.branch.timeZone)}`,
          }))}
        />
        <Relation
          label="Horario"
          required
          value={assignmentId}
          onChange={setAssignment}
          options={data.assignments
            .filter((a) => a.userId === userId && a.kind === "work")
            .map((a) => ({
              id: a.id,
              name: `${dateLabel(a.businessDate)} · ${clock(a.startsAt, data.branch.timeZone)} – ${clock(a.endsAt, data.branch.timeZone)}`,
            }))}
        />
        <Field label="Motivo" required>
          <textarea
            required
            minLength={3}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
        <Button disabled={busy}>Vincular horario</Button>
      </form>
    </details>
  );
}
