import { AppError } from "@/lib/errors";
import { scheduleInstant } from "@/modules/production/schedule-time";

export type PunchKind = "entry" | "pause" | "resume" | "exit";
export type TimelineEvent = {
  id: string;
  kind: PunchKind;
  branchId: string;
  occurredAt: Date | string;
  sequence?: number;
};
export type LocationEvidence = {
  latitude: number;
  longitude: number;
  accuracy: number;
  measuredAt: string;
};
export type LocationPolicy = {
  latitude: number | null;
  longitude: number | null;
  radiusMeters: number;
  maxAccuracyMeters: number;
};
export type ScheduleInput = {
  date: string;
  start: string;
  end: string;
  overnight: boolean;
  pauseMinutes: number;
};
function invalid(message: string, code = "ATTENDANCE_INVALID"): never {
  throw new AppError(code, message, 409);
}
export function evaluateLocation(
  policy: LocationPolicy,
  evidence: LocationEvidence,
  now: Date,
) {
  if (
    policy.latitude === null ||
    policy.longitude === null ||
    !Number.isFinite(policy.latitude) ||
    !Number.isFinite(policy.longitude) ||
    policy.radiusMeters <= 0 ||
    policy.maxAccuracyMeters <= 0
  )
    invalid(
      "Administración debe configurar la ubicación y el radio de esta sucursal.",
      "ATTENDANCE_NOT_CONFIGURED",
    );
  if (
    !Number.isFinite(evidence.latitude) ||
    Math.abs(evidence.latitude) > 90 ||
    !Number.isFinite(evidence.longitude) ||
    Math.abs(evidence.longitude) > 180 ||
    !Number.isFinite(evidence.accuracy) ||
    evidence.accuracy <= 0
  )
    invalid(
      "No recibimos una ubicación válida. Permití la ubicación y volvé a intentarlo.",
      "LOCATION_INVALID",
    );
  const age = now.getTime() - Date.parse(evidence.measuredAt);
  if (!Number.isFinite(age) || age > 30000 || age < -10000)
    invalid(
      "La ubicación debe ser reciente. Actualizala para continuar.",
      "LOCATION_STALE",
    );
  if (evidence.accuracy > policy.maxAccuracyMeters)
    invalid(
      "La ubicación no tiene suficiente precisión. Probá junto al local y volvé a intentarlo.",
      "LOCATION_ACCURACY",
    );
  const rad = (n: number) => (n * Math.PI) / 180;
  const dLat = rad(evidence.latitude - policy.latitude);
  const dLon = rad(evidence.longitude - policy.longitude);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(policy.latitude)) *
      Math.cos(rad(evidence.latitude)) *
      Math.sin(dLon / 2) ** 2;
  const distanceMeters =
    6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  if (distanceMeters + evidence.accuracy > policy.radiusMeters)
    invalid(
      "No podemos confirmar que estés dentro de la zona del local. Acercate o solicitá ayuda al encargado.",
      "LOCATION_OUTSIDE",
    );
  return {
    distanceMeters,
    accuracyMeters: evidence.accuracy,
    measuredAt: evidence.measuredAt,
    latitude: evidence.latitude,
    longitude: evidence.longitude,
  };
}
export function orderedEvents<T extends TimelineEvent>(events: T[]): T[] {
  return [...events].sort(
    (a, b) =>
      new Date(a.occurredAt).getTime() - new Date(b.occurredAt).getTime() ||
      (a.sequence ?? 0) - (b.sequence ?? 0),
  );
}
export function validateTimeline(events: TimelineEvent[]) {
  let state: "out" | "working" | "pause" = "out";
  let branchId: string | null = null;
  let entryId: string | null = null;
  for (const e of orderedEvents(events)) {
    if (!Number.isFinite(new Date(e.occurredAt).getTime()))
      invalid("Hay una hora de fichaje inválida.");
    if (e.kind === "entry") {
      if (state !== "out")
        invalid(
          "Ya hay una entrada abierta. El encargado debe regularizarla antes de registrar otra.",
          "ATTENDANCE_OPEN",
        );
      state = "working";
      branchId = e.branchId;
      entryId = e.id;
    } else {
      if (state === "out" || branchId !== e.branchId)
        invalid(
          "Este fichaje necesita una entrada abierta en la misma sucursal.",
        );
      if (e.kind === "pause") {
        if (state !== "working") invalid("Ya hay una pausa abierta.");
        state = "pause";
      } else if (e.kind === "resume") {
        if (state !== "pause")
          invalid("No hay una pausa abierta para finalizar.");
        state = "working";
      } else {
        if (state !== "working")
          invalid("Finalizá la pausa antes de registrar la salida.");
        state = "out";
        branchId = null;
        entryId = null;
      }
    }
  }
  return { state, branchId, entryId };
}
export function summarizeAttendance(events: TimelineEvent[], now: Date) {
  validateTimeline(events);
  let presence = 0,
    pauses = 0,
    interruptions = 0;
  let entry: number | null = null,
    pause: number | null = null,
    previousExit: number | null = null;
  let firstEntry: string | null = null,
    lastExit: string | null = null;
  for (const e of orderedEvents(events)) {
    const time = new Date(e.occurredAt).getTime();
    if (e.kind === "entry") {
      firstEntry ??= new Date(time).toISOString();
      if (previousExit !== null) interruptions += time - previousExit;
      entry = time;
      lastExit = null;
    }
    if (e.kind === "pause") pause = time;
    if (e.kind === "resume" && pause !== null) {
      pauses += time - pause;
      pause = null;
    }
    if (e.kind === "exit" && entry !== null) {
      presence += time - entry;
      entry = null;
      previousExit = time;
      lastExit = new Date(time).toISOString();
    }
  }
  if (entry !== null) presence += Math.max(0, now.getTime() - entry);
  if (pause !== null) pauses += Math.max(0, now.getTime() - pause);
  return {
    presenceMinutes: presence / 60000,
    pauseMinutes: pauses / 60000,
    netMinutes: (presence - pauses) / 60000,
    interruptionsMinutes: interruptions / 60000,
    provisional: entry !== null,
    firstEntry,
    lastExit,
  };
}
export function validLocalDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value + "T12:00:00Z")) &&
    new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value
  );
}
export function canEnterAssignment(
  row: {
    kind: string;
    businessDate: string;
    startsAt: string | Date | null;
    endsAt: string | Date | null;
  },
  today: string,
  now: Date,
) {
  return (
    row.kind === "work" &&
    (row.businessDate === today ||
      (!!row.startsAt &&
        !!row.endsAt &&
        new Date(row.startsAt) <= now &&
        new Date(row.endsAt) >= now))
  );
}
export function addDays(date: string, count: number) {
  if (!validLocalDate(date)) invalid("Revisá la fecha.");
  const at = new Date(date + "T12:00:00Z");
  at.setUTCDate(at.getUTCDate() + count);
  return at.toISOString().slice(0, 10);
}
export function assignmentWindow(input: ScheduleInput, timeZone: string) {
  if (
    !validLocalDate(input.date) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.start) ||
    !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.end)
  )
    invalid("Revisá la fecha y las horas del turno.");
  const startsAt = scheduleInstant(input.date + "T" + input.start, timeZone);
  const endsAt = scheduleInstant(
    addDays(input.date, input.overnight ? 1 : 0) + "T" + input.end,
    timeZone,
  );
  const durationMinutes = (Date.parse(endsAt) - Date.parse(startsAt)) / 60000;
  if (
    durationMinutes <= 0 ||
    durationMinutes >= 1440 ||
    !Number.isInteger(input.pauseMinutes) ||
    input.pauseMinutes < 0 ||
    input.pauseMinutes >= durationMinutes
  )
    invalid(
      "El turno debe durar menos de 24 horas y su pausa debe ser menor que su duración.",
    );
  return { startsAt, endsAt, durationMinutes };
}
