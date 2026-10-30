import { and, eq, asc, isNull } from "drizzle-orm";
import type { Tx } from "@/db/types";
import {
  attendanceEvents,
  attendanceCorrections,
  attendanceAssignments,
  attendanceEventLinks,
} from "@/db/attendance-schema";
import type { OperationalContext } from "@/modules/operations/types";
import { AppError } from "@/lib/errors";
import { localSchedule } from "@/modules/production/schedule-time";
import {
  validateTimeline,
  orderedEvents,
  canEnterAssignment,
  type PunchKind,
} from "./rules";
export type EffectiveEvent = typeof attendanceEvents.$inferSelect & {
  correctionId?: string;
  originalOccurredAt?: string;
};
export async function effectiveEvents(
  tx: Tx,
  userId: string,
): Promise<EffectiveEvent[]> {
  const rows: EffectiveEvent[] = await tx
    .select()
    .from(attendanceEvents)
    .where(eq(attendanceEvents.userId, userId))
    .orderBy(asc(attendanceEvents.occurredAt), asc(attendanceEvents.sequence));
  const corrections = await tx
    .select()
    .from(attendanceCorrections)
    .where(
      and(
        eq(attendanceCorrections.userId, userId),
        eq(attendanceCorrections.status, "approved"),
      ),
    )
    .orderBy(
      asc(attendanceCorrections.resolvedAt),
      asc(attendanceCorrections.id),
    );
  const effective = new Map(rows.map((row) => [row.id, row]));
  for (const correction of corrections)
    for (const change of correction.changes) {
      const previous = effective.get(change.eventId);
      if (!previous) continue;
      if (change.occurredAt === null) effective.delete(change.eventId);
      else
        effective.set(previous.id, {
          ...previous,
          occurredAt: new Date(change.occurredAt),
          correctionId: correction.id,
          originalOccurredAt:
            previous.originalOccurredAt ?? previous.occurredAt.toISOString(),
        });
    }
  const links = await tx
    .select({
      entryId: attendanceEventLinks.entryId,
      assignmentId: attendanceEventLinks.assignmentId,
      businessDate: attendanceAssignments.businessDate,
    })
    .from(attendanceEventLinks)
    .innerJoin(
      attendanceEvents,
      eq(attendanceEvents.id, attendanceEventLinks.entryId),
    )
    .innerJoin(
      attendanceAssignments,
      eq(attendanceAssignments.id, attendanceEventLinks.assignmentId),
    )
    .where(eq(attendanceEvents.userId, userId));
  let reference: { assignmentId: string | null; businessDate: string } | null =
    null;
  return orderedEvents([...effective.values()]).map((event) => {
    if (event.kind === "entry") {
      const link = links.find((l) => l.entryId === event.id);
      reference = link
        ? { assignmentId: link.assignmentId, businessDate: link.businessDate }
        : {
            assignmentId: event.assignmentId,
            businessDate: event.businessDate,
          };
    }
    const row = { ...event, ...(reference ?? {}) };
    if (event.kind === "exit") reference = null;
    return row;
  });
}
export async function entryReference(
  tx: Tx,
  ctx: OperationalContext,
  userId: string,
  at: Date,
  assignmentId?: string | null,
) {
  const date = localSchedule(at.toISOString(), ctx.timeZone).slice(0, 10);
  const rows = await tx
    .select()
    .from(attendanceAssignments)
    .where(
      and(
        eq(attendanceAssignments.userId, userId),
        eq(attendanceAssignments.branchId, ctx.branchId),
        eq(attendanceAssignments.kind, "work"),
        isNull(attendanceAssignments.canceledAt),
      ),
    );
  const available = rows.filter((row) => canEnterAssignment(row, date, at));
  let chosen;
  if (assignmentId) {
    chosen = available.find((row) => row.id === assignmentId);
    if (!chosen)
      throw new AppError(
        "ATTENDANCE_ASSIGNMENT",
        "El turno elegido no corresponde a esta persona, sucursal o jornada.",
        409,
      );
  } else if (available.length === 1) chosen = available[0];
  else if (available.length > 1)
    throw new AppError(
      "ATTENDANCE_ASSIGNMENT_REQUIRED",
      "Elegí cuál de tus turnos estás comenzando.",
      409,
    );
  return {
    assignmentId: chosen?.id ?? null,
    businessDate: chosen?.businessDate ?? date,
  };
}
export async function prepareEvents(
  tx: Tx,
  ctx: OperationalContext,
  userId: string,
  kind: PunchKind,
  at: Date,
  assignmentId?: string | null,
  declarationOnly = false,
) {
  const previous = await effectiveEvents(tx, userId);
  const current = validateTimeline(previous);
  const last = previous.at(-1);
  if (last && at < last.occurredAt)
    throw new AppError(
      "ATTENDANCE_CHRONOLOGY",
      "La hora es anterior al último fichaje. Solicitá una corrección para regularizar la secuencia.",
      409,
    );
  const entry = previous.find((e) => e.id === current.entryId);
  const reference =
    kind === "entry"
      ? await entryReference(tx, ctx, userId, at, assignmentId)
      : {
          assignmentId: entry?.assignmentId ?? null,
          businessDate:
            entry?.businessDate ??
            localSchedule(at.toISOString(), ctx.timeZone).slice(0, 10),
        };
  const kinds: PunchKind[] =
    kind === "exit" && current.state === "pause" ? ["resume", "exit"] : [kind];
  const additions = kinds.map((k, i) => ({
    id: crypto.randomUUID(),
    kind: k,
    branchId: ctx.branchId,
    occurredAt: at,
    sequence: (last?.sequence ?? 0) + i + 1,
  }));
  // A declared new entry may wait for regularization. Redemption always validates the full timeline.
  if (!(declarationOnly && kind === "entry"))
    validateTimeline([...previous, ...additions]);
  return { additions, reference };
}
