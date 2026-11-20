import { AppError } from "@/lib/errors";
import { addDays, validLocalDate } from "./rules";

export const MAX_SCHEDULE_PERIOD_DAYS = 90;
export type SchedulePeriod = { from: string; to: string; weekdays: number[] };
export type AssignmentPeriodPreview = {
  shift: {
    id: string;
    revision: number;
    name: string;
    start: string;
    end: string;
    overnight: boolean;
    pauseMinutes: number;
  };
  rows: {
    businessDate: string;
    startsAt: string;
    endsAt: string;
    status: "available" | "skipped";
    reason: string | null;
  }[];
};
export type AssignmentPeriodResult = {
  id: string;
  created: number;
  skipped: number;
  rows: {
    businessDate: string;
    status: "created" | "skipped";
    reason: string | null;
  }[];
};

export function schedulePeriodDates({ from, to, weekdays }: SchedulePeriod) {
  if (!validLocalDate(from) || !validLocalDate(to) || from > to)
    throw new AppError("VALIDATION", "Revisá las fechas desde y hasta.", 400);
  if (
    (Date.parse(to) - Date.parse(from)) / 86400000 >=
    MAX_SCHEDULE_PERIOD_DAYS
  )
    throw new AppError(
      "VALIDATION",
      "Podés asignar hasta 90 días por vez.",
      400,
    );
  if (
    !weekdays.length ||
    weekdays.some((day) => !Number.isInteger(day) || day < 0 || day > 6)
  )
    throw new AppError(
      "VALIDATION",
      "Seleccioná al menos un día de la semana.",
      400,
    );
  const selected = new Set(weekdays);
  const dates: string[] = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    if (selected.has(new Date(date + "T12:00:00Z").getUTCDay()))
      dates.push(date);
  }
  if (!dates.length)
    throw new AppError(
      "VALIDATION",
      "El período no contiene los días seleccionados.",
      400,
    );
  return dates;
}
