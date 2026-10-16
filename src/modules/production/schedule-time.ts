export function localSchedule(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso));
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}
/** Interpret the wall clock in the branch, independently of the browser's zone. */
export function scheduleInstant(local: string, timeZone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))
    throw new Error("Elegí fecha y hora previstas.");
  const wall = Date.parse(`${local}:00Z`);
  if (!Number.isFinite(wall)) throw new Error("Revisá la fecha prevista.");
  let instant = wall;
  for (let i = 0; i < 4; i++) {
    const shown = Date.parse(
      `${localSchedule(new Date(instant).toISOString(), timeZone)}:00Z`,
    );
    instant += wall - shown;
  }
  const iso = new Date(instant).toISOString();
  if (localSchedule(iso, timeZone) !== local)
    throw new Error(
      "Esa hora no existe en la zona horaria de la sucursal. Elegí otra.",
    );
  return iso;
}
