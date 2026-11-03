"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  CalendarRange,
  CheckCircle2,
  Clock3,
  LoaderCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { FieldCaption } from "@/components/ui/field-caption";
import { privateRequest, RequestFailure } from "@/components/identity/client";
import { addDays } from "@/modules/attendance/rules";
import {
  schedulePeriodDates,
  type AssignmentPeriodPreview,
  type AssignmentPeriodResult,
} from "@/modules/attendance/period";
import {
  Drawer,
  Field,
  Relation,
  dateLabel,
  type Snapshot,
  type Command,
} from "./shared";

const weekdays = [
  { value: 1, short: "Lun", name: "Lunes" },
  { value: 2, short: "Mar", name: "Martes" },
  { value: 3, short: "Mié", name: "Miércoles" },
  { value: 4, short: "Jue", name: "Jueves" },
  { value: 5, short: "Vie", name: "Viernes" },
  { value: 6, short: "Sáb", name: "Sábado" },
  { value: 0, short: "Dom", name: "Domingo" },
];

export function AssignmentPeriodForm({
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
  const [userId, setUser] = useState("");
  const [shiftId, setShift] = useState("");
  const [from, setFrom] = useState(data.from);
  const [to, setTo] = useState(addDays(data.from, 6));
  const [days, setDays] = useState(weekdays.map((day) => day.value));
  const [preview, setPreview] = useState<AssignmentPeriodPreview | null>(null);
  const [result, setResult] = useState<AssignmentPeriodResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  const confirming = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  const selectedShift = data.shifts.find((shift) => shift.id === shiftId);
  const available =
    preview?.rows.filter((row) => row.status === "available").length ?? 0;
  let count = 0;
  try {
    count = schedulePeriodDates({ from, to, weekdays: days }).length;
  } catch {
    /* Explain invalid input when reviewing. */
  }

  function invalidate() {
    controller.current?.abort();
    setChecking(false);
    setPreview(null);
    setError("");
  }
  async function review(event: FormEvent) {
    event.preventDefault();
    if (busy || checking) return;
    invalidate();
    const request = new AbortController();
    controller.current = request;
    try {
      schedulePeriodDates({ from, to, weekdays: days });
      setChecking(true);
      const response = await privateRequest<AssignmentPeriodPreview>(
        "/api/attendance/schedule-preview",
        data.branch.id,
        { userId, shiftId, from, to, weekdays: days },
        request.signal,
      );
      if (!request.signal.aborted) setPreview(response);
    } catch (cause) {
      if (!request.signal.aborted)
        setError(
          cause instanceof Error
            ? cause.message
            : "No pudimos revisar las fechas. Volvé a intentar.",
        );
    } finally {
      if (!request.signal.aborted) setChecking(false);
    }
  }
  async function confirm() {
    if (!preview || !available || busy || confirming.current) return;
    confirming.current = true;
    try {
      const response = await command({
        action: "assignPeriod",
        userId,
        shiftId,
        from,
        to,
        weekdays: days,
        expectedShiftRevision: preview.shift.revision,
      });
      setResult(response as AssignmentPeriodResult);
    } catch (cause) {
      if (cause instanceof RequestFailure && cause.status < 500)
        setPreview(null);
      // The shared drawer displays the command error. An uncertain send retains
      // its preview and the command journal retries the same requestId.
    } finally {
      confirming.current = false;
    }
  }
  return (
    <Drawer
      title="Asignar varios días"
      description="Elegí un turno y aplicalo a varias fechas. Los horarios, francos y fichajes existentes se conservan."
      className="att-period-drawer"
      onClose={onClose}
      busy={busy}
    >
      {result ? (
        <section className="att-stack" aria-label="Resultado de la asignación">
          <div className="att-period-result" role="status">
            <CheckCircle2 size={28} aria-hidden="true" />
            <div>
              <h3>Horarios asignados</h3>
              <strong>
                {result.created === 1
                  ? "1 horario agregado"
                  : `${result.created} horarios agregados`}
              </strong>
              <p>
                {result.skipped
                  ? `${result.skipped} ${result.skipped === 1 ? "fecha conservada" : "fechas conservadas"}. Revisá el detalle.`
                  : "Podés ajustar cada día desde la planificación semanal."}
              </p>
            </div>
          </div>
          <PeriodRows rows={result.rows} />
          <Button className="min-h-12" onClick={onClose}>
            Listo
          </Button>
        </section>
      ) : (
        <form className="att-stack" onSubmit={review}>
          <fieldset disabled={busy} className="att-stack">
            <Relation
              label="Empleado"
              required
              value={userId}
              options={data.people.filter(
                (person) => person.active && person.enabled,
              )}
              disabled={busy}
              onChange={(value) => {
                invalidate();
                setUser(value);
              }}
            />
            <Relation
              label="Turno habitual"
              required
              value={shiftId}
              options={data.shifts
                .filter((shift) => shift.active)
                .map((shift) => ({
                  id: shift.id,
                  name: shift.name,
                  description: `${shift.start} – ${shift.end}${shift.overnight ? " (+1 día)" : ""} · Pausa ${shift.pauseMinutes} min`,
                }))}
              disabled={busy}
              onChange={(value) => {
                invalidate();
                setShift(value);
              }}
            />
            {selectedShift && (
              <div className="att-period-shift">
                <Clock3 size={19} aria-hidden="true" />
                <strong>
                  {selectedShift.start} – {selectedShift.end}
                  {selectedShift.overnight ? " (+1 día)" : ""}
                </strong>
                <span>Pausa {selectedShift.pauseMinutes} min</span>
              </div>
            )}
            <section
              className="att-period-dates"
              aria-label="Fechas de la asignación"
            >
              <div className="att-period-section-title">
                <CalendarRange size={18} aria-hidden="true" />
                <h3>Cuándo se repite</h3>
              </div>
              <div className="att-period-shortcuts">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    invalidate();
                    setFrom(data.from);
                    setTo(addDays(data.from, 6));
                  }}
                >
                  Semana en pantalla
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    invalidate();
                    setFrom(addDays(data.from, 7));
                    setTo(addDays(data.from, 13));
                  }}
                >
                  Semana siguiente
                </Button>
              </div>
              <div className="att-form-grid">
                <Field label="Desde" required>
                  <input
                    type="date"
                    required
                    value={from}
                    onChange={(event) => {
                      invalidate();
                      setFrom(event.target.value);
                    }}
                  />
                </Field>
                <Field label="Hasta" required>
                  <input
                    type="date"
                    required
                    value={to}
                    min={from || undefined}
                    onChange={(event) => {
                      invalidate();
                      setTo(event.target.value);
                    }}
                  />
                </Field>
              </div>
              <fieldset className="att-period-weekdays">
                <legend>
                  <FieldCaption required>Días de la semana</FieldCaption>
                </legend>
                <div>
                  {weekdays.map((day) => (
                    <label key={day.value}>
                      <input
                        type="checkbox"
                        aria-label={day.name}
                        checked={days.includes(day.value)}
                        onChange={(event) => {
                          invalidate();
                          setDays((current) =>
                            event.target.checked
                              ? [...current, day.value]
                              : current.filter((value) => value !== day.value),
                          );
                        }}
                      />
                      <span aria-hidden="true">{day.short}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <p>
                {count
                  ? `${count} ${count === 1 ? "fecha seleccionada" : "fechas seleccionadas"} · `
                  : ""}
                Hasta 90 días por asignación. Desmarcá los días que no
                corresponden.
              </p>
            </section>
          </fieldset>
          {error && (
            <p role="alert" className="att-error">
              {error}
            </p>
          )}
          <Button
            type="submit"
            variant="outline"
            className="min-h-12"
            disabled={busy || checking}
          >
            {checking ? (
              <>
                <LoaderCircle className="animate-spin" aria-hidden="true" />{" "}
                Revisando fechas…
              </>
            ) : (
              <>
                <CalendarRange aria-hidden="true" /> Revisar fechas
              </>
            )}
          </Button>
          {preview && (
            <section
              className="att-period-preview att-stack"
              aria-label="Vista previa de horarios"
            >
              <div className="att-period-preview-heading">
                <div>
                  <h3>Revisá antes de confirmar</h3>
                  <p>
                    {preview.shift.name} · {preview.shift.start} –{" "}
                    {preview.shift.end}
                    {preview.shift.overnight ? " (+1 día)" : ""} · Pausa{" "}
                    {preview.shift.pauseMinutes} min
                  </p>
                </div>
                <div className="att-period-counts">
                  <strong>{available} por agregar</strong>
                  <span>{preview.rows.length - available} se omiten</span>
                </div>
              </div>
              <PeriodRows rows={preview.rows} />
              <p>
                Al guardar volvemos a comprobar las fechas. Si alguien asignó un
                horario mientras revisabas, se conservará y te lo indicaremos.
              </p>
              {available ? (
                <Button
                  type="button"
                  className="min-h-12"
                  disabled={busy}
                  onClick={() => void confirm()}
                >
                  {busy
                    ? "Asignando horarios…"
                    : `Confirmar ${available} ${available === 1 ? "horario" : "horarios"}`}
                </Button>
              ) : (
                <p role="status" className="att-info">
                  No hay fechas libres para agregar. Ajustá el período o los
                  días seleccionados.
                </p>
              )}
            </section>
          )}
        </form>
      )}
    </Drawer>
  );
}

function PeriodRows({
  rows,
}: {
  rows: (
    | AssignmentPeriodPreview["rows"][number]
    | AssignmentPeriodResult["rows"][number]
  )[];
}) {
  return (
    <ul className="att-period-rows" aria-label="Detalle por fecha">
      {rows.map((row) => (
        <li
          key={row.businessDate}
          data-skipped={row.status === "skipped" || undefined}
        >
          <time dateTime={row.businessDate}>
            {new Intl.DateTimeFormat("es-AR", {
              weekday: "short",
              timeZone: "UTC",
            }).format(new Date(row.businessDate + "T12:00:00Z"))}{" "}
            {dateLabel(row.businessDate)}
          </time>
          <span>
            {row.reason ??
              (row.status === "created" ? "Agregado" : "Se agregará")}
          </span>
        </li>
      ))}
    </ul>
  );
}
