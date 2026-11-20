import { and, eq, isNull } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import type { Actor } from "@/lib/access";
import type { OperationalContext } from "@/modules/operations/types";
import { AppError } from "@/lib/errors";
import { requireOperationalContext } from "@/modules/branches/context";
import {
  attendanceAssignments,
  attendanceEvents,
  attendanceShifts,
} from "@/db/attendance-schema";
import {
  requireAttendanceManager,
  requireParticipant,
  getAttendancePolicy,
} from "./access";
import { schedulePeriodSchema, type SchedulePeriodInput } from "./validation";
import { schedulePeriodDates, type AssignmentPeriodPreview } from "./period";
import { assignmentWindow } from "./rules";

export async function planAssignmentPeriod(
  tx: Tx,
  ctx: OperationalContext,
  input: SchedulePeriodInput,
  expectedShiftRevision?: number,
): Promise<AssignmentPeriodPreview> {
  requireAttendanceManager(ctx);
  await requireParticipant(tx, ctx.branchId, input.userId);
  const dates = schedulePeriodDates(input);
  const [[shift], assignments, events] = await Promise.all([
    tx
      .select()
      .from(attendanceShifts)
      .where(
        and(
          eq(attendanceShifts.id, input.shiftId),
          eq(attendanceShifts.branchId, ctx.branchId),
        ),
      ),
    tx
      .select()
      .from(attendanceAssignments)
      .where(
        and(
          eq(attendanceAssignments.userId, input.userId),
          isNull(attendanceAssignments.canceledAt),
        ),
      ),
    tx
      .select({ businessDate: attendanceEvents.businessDate })
      .from(attendanceEvents)
      .where(eq(attendanceEvents.userId, input.userId)),
  ]);
  if (!shift?.active)
    throw new AppError(
      "ATTENDANCE_SHIFT",
      "Elegí un turno activo de esta sucursal.",
      400,
    );
  if (
    expectedShiftRevision !== undefined &&
    shift.revision !== expectedShiftRevision
  )
    throw new AppError(
      "REVISION_CONFLICT",
      "El turno cambió. Revisá las fechas nuevamente antes de confirmar.",
      409,
    );
  const punched = new Set(events.map((event) => event.businessDate));
  return {
    shift: {
      id: shift.id,
      revision: shift.revision,
      name: shift.name,
      start: shift.start,
      end: shift.end,
      overnight: shift.overnight,
      pauseMinutes: shift.pauseMinutes,
    },
    rows: dates.map((businessDate) => {
      const window = assignmentWindow(
        {
          date: businessDate,
          start: shift.start,
          end: shift.end,
          overnight: shift.overnight,
          pauseMinutes: shift.pauseMinutes,
        },
        ctx.timeZone,
      );
      const sameDay = assignments.filter(
        (row) => row.businessDate === businessDate,
      );
      const reason = sameDay.some((row) => row.kind === "off")
        ? "Franco ya asignado"
        : sameDay.length
          ? "Horario ya asignado"
          : punched.has(businessDate)
            ? "Ya tiene fichajes"
            : assignments.some(
                  (row) =>
                    row.kind === "work" &&
                    new Date(window.startsAt) < row.endsAt! &&
                    new Date(window.endsAt) > row.startsAt!,
                )
              ? "Se superpone con otro turno"
              : null;
      return {
        businessDate,
        startsAt: window.startsAt,
        endsAt: window.endsAt,
        status: reason ? "skipped" : "available",
        reason,
      };
    }),
  };
}

export async function previewAssignmentPeriod(
  db: AppDb,
  actor: Actor,
  raw: unknown,
) {
  const input = schedulePeriodSchema.parse(raw);
  return db.transaction(async (tx) => {
    const ctx = await requireOperationalContext(
      tx,
      actor,
      actor.branchId ?? "",
    );
    if (ctx.accountKind === "store")
      throw new AppError(
        "FORBIDDEN",
        "Usá tu cuenta personal de encargado o administrador para asignar horarios.",
        403,
      );
    requireAttendanceManager(ctx);
    await getAttendancePolicy(tx, ctx.branchId);
    return planAssignmentPeriod(tx, ctx, input);
  });
}
