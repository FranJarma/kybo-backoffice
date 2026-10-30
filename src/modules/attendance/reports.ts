import {
  orderedEvents,
  summarizeAttendance,
  validateTimeline,
  type TimelineEvent,
} from "./rules";
type DatedEvent = TimelineEvent & {
  businessDate: string;
  assignmentId?: string | null;
};
type Assignment = {
  id: string;
  startsAt: string | Date | null;
  endsAt: string | Date | null;
  pauseMinutes: number;
};
export function summarizeDays(events: DatedEvent[], now: Date) {
  validateTimeline(events);
  const days = [...new Set(events.map((e) => e.businessDate))].sort();
  const totals = days.map((day) =>
    summarizeAttendance(
      events.filter((e) => e.businessDate === day),
      now,
    ),
  );
  return {
    presenceMinutes: totals.reduce((n, t) => n + t.presenceMinutes, 0),
    pauseMinutes: totals.reduce((n, t) => n + t.pauseMinutes, 0),
    netMinutes: totals.reduce((n, t) => n + t.netMinutes, 0),
    interruptionsMinutes: totals.reduce(
      (n, t) => n + t.interruptionsMinutes,
      0,
    ),
    provisional: totals.some((t) => t.provisional),
    firstEntry: totals[0]?.firstEntry ?? null,
    lastExit: totals.at(-1)?.lastExit ?? null,
  };
}
export function compareAssignment(
  events: DatedEvent[],
  assignment: Assignment,
  now: Date,
) {
  const rows = orderedEvents(
    events.filter((e) => e.assignmentId === assignment.id),
  );
  const total = summarizeAttendance(rows, now);
  const endsAt = assignment.endsAt
    ? new Date(assignment.endsAt).getTime()
    : null;
  return {
    total,
    entryDifference:
      total.firstEntry && assignment.startsAt
        ? (Date.parse(total.firstEntry) -
            new Date(assignment.startsAt).getTime()) /
          60000
        : null,
    exitDifference:
      total.lastExit && endsAt !== null
        ? (Date.parse(total.lastExit) - endsAt) / 60000
        : null,
    pauseDifference: rows.length
      ? total.pauseMinutes - assignment.pauseMinutes
      : null,
    needsReview:
      endsAt !== null &&
      endsAt < now.getTime() &&
      (!rows.length || total.provisional),
  };
}
export function correctionPreview<T extends DatedEvent>(
  events: T[],
  changes: { eventId: string; occurredAt: string | null }[],
  now: Date,
) {
  const affected = new Set(changes.map((c) => c.eventId));
  const originals = events.filter((e) => affected.has(e.id));
  if (originals.length !== changes.length)
    return {
      error:
        "Alguna marca cambió o ya fue anulada. Solicitá una nueva corrección.",
      before: null,
      after: null,
      changes: [],
    };
  const days = new Set(originals.map((e) => e.businessDate));
  const afterEvents = events.flatMap((e) => {
    const change = changes.find((c) => c.eventId === e.id);
    return !change
      ? [e]
      : change.occurredAt === null
        ? []
        : [{ ...e, occurredAt: change.occurredAt }];
  });
  try {
    validateTimeline(afterEvents);
    return {
      error: null,
      before: summarizeDays(
        events.filter((e) => days.has(e.businessDate)),
        now,
      ),
      after: summarizeDays(
        afterEvents.filter((e) => days.has(e.businessDate)),
        now,
      ),
      changes: changes.map((c) => {
        const original = originals.find((e) => e.id === c.eventId)!;
        return {
          eventId: c.eventId,
          kind: original.kind,
          before: new Date(original.occurredAt).toISOString(),
          after: c.occurredAt,
        };
      }),
    };
  } catch {
    return {
      error:
        "La propuesta necesita regularización para conservar una secuencia válida.",
      before: null,
      after: null,
      changes: [],
    };
  }
}
