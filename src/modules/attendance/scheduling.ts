import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import type { Tx } from "@/db/types";
import { auditEvents } from "@/db/business-schema";
import {
  attendanceSettings,
  attendanceParticipants,
  attendanceShifts,
  attendanceAssignments,
  attendanceEvents,
  attendanceCorrections,
  attendanceEventLinks,
} from "@/db/attendance-schema";
import type { OperationalContext } from "@/modules/operations/types";
import { requireAdministrator } from "@/modules/branches/context";
import { getSavedBranchAddress } from "@/modules/branches/address";
import { localSchedule } from "@/modules/production/schedule-time";
import { AppError } from "@/lib/errors";
import { canonicalHash } from "@/modules/identity/crypto";
import type { AttendanceCommand } from "./validation";
import {
  addDays,
  assignmentWindow,
  validLocalDate,
  validateTimeline,
} from "./rules";
import {
  requireBranchEmployee,
  requireParticipant,
  requireAttendanceManager,
} from "./access";
import { effectiveEvents, entryReference, type EffectiveEvent } from "./events";

type Result = { id: string; [key: string]: unknown };
type Assign = Extract<AttendanceCommand, { action: "assign" }>;
function conflict(
  message = "Los datos cambiaron. Actualizá la pantalla antes de guardar.",
): never {
  throw new AppError("REVISION_CONFLICT", message, 409);
}
async function audit(
  tx: Tx,
  ctx: OperationalContext,
  entity: string,
  id: string,
  before: unknown,
  after: unknown,
  now: Date,
) {
  await tx.insert(auditEvents).values({
    actorId: ctx.actorId,
    entity,
    recordId: id,
    action: "changed",
    before,
    after,
    createdAt: now,
  });
}
export async function assignDay(
  tx: Tx,
  ctx: OperationalContext,
  input: Assign,
  now: Date,
): Promise<Result> {
  requireAttendanceManager(ctx);
  await requireParticipant(tx, ctx.branchId, input.userId);
  if (!validLocalDate(input.businessDate))
    throw new AppError("VALIDATION", "Revisá la fecha del horario.", 400);
  const [previous] = input.id
    ? await tx
        .select()
        .from(attendanceAssignments)
        .where(eq(attendanceAssignments.id, input.id))
        .for("update")
    : [];
  if (
    input.id &&
    (!previous ||
      previous.branchId !== ctx.branchId ||
      previous.userId !== input.userId ||
      previous.canceledAt)
  )
    throw new AppError("NOT_FOUND", "El horario ya no está disponible.", 404);
  if (previous && input.expectedRevision !== previous.revision) conflict();
  const dates = new Set([
    input.businessDate,
    ...(previous ? [previous.businessDate] : []),
  ]);
  const recorded = (
    await tx
      .select({ businessDate: attendanceEvents.businessDate })
      .from(attendanceEvents)
      .where(
        and(
          eq(attendanceEvents.branchId, ctx.branchId),
          eq(attendanceEvents.userId, input.userId),
        ),
      )
  ).some((e) => dates.has(e.businessDate));
  if (recorded && input.reason.trim().length < 3)
    throw new AppError(
      "REASON_REQUIRED",
      "Ya hay fichajes en esa jornada. Indicá el motivo del cambio de horario.",
      400,
    );
  const [shift] = input.shiftId
    ? await tx
        .select()
        .from(attendanceShifts)
        .where(eq(attendanceShifts.id, input.shiftId))
    : [];
  if (
    input.shiftId &&
    (!shift ||
      shift.branchId !== ctx.branchId ||
      (!shift.active && previous?.shiftId !== shift.id))
  )
    throw new AppError(
      "ATTENDANCE_SHIFT",
      "Elegí un turno activo de esta sucursal.",
      400,
    );
  const sameSnapshot =
    previous?.kind === "work" && previous.shiftId === input.shiftId;
  const previousStart =
    sameSnapshot && previous.startsAt
      ? localSchedule(previous.startsAt.toISOString(), previous.timeZone).slice(
          11,
        )
      : undefined;
  const previousEnd =
    sameSnapshot && previous.endsAt
      ? localSchedule(previous.endsAt.toISOString(), previous.timeZone).slice(
          11,
        )
      : undefined;
  const start = input.start ?? previousStart ?? shift?.start;
  const end = input.end ?? previousEnd ?? shift?.end;
  const overnight =
    input.overnight ??
    (sameSnapshot
      ? localSchedule(
          previous!.endsAt!.toISOString(),
          previous!.timeZone,
        ).slice(0, 10) !== previous!.businessDate
      : (shift?.overnight ?? false));
  const pauseMinutes =
    input.kind === "off"
      ? 0
      : (input.pauseMinutes ??
        (sameSnapshot ? previous!.pauseMinutes : (shift?.pauseMinutes ?? 30)));
  if (input.kind === "work" && (!start || !end))
    throw new AppError(
      "VALIDATION",
      "Elegí un turno o completá entrada y salida.",
      400,
    );
  const window =
    input.kind === "work"
      ? assignmentWindow(
          {
            date: input.businessDate,
            start: start!,
            end: end!,
            overnight,
            pauseMinutes,
          },
          ctx.timeZone,
        )
      : null;
  const others = await tx
    .select()
    .from(attendanceAssignments)
    .where(
      and(
        eq(attendanceAssignments.userId, input.userId),
        isNull(attendanceAssignments.canceledAt),
      ),
    );
  for (const other of others.filter((a) => a.id !== input.id)) {
    if (
      other.businessDate === input.businessDate &&
      (other.kind === "off" || input.kind === "off")
    )
      conflict(
        "Un franco completo no puede combinarse con otros horarios de esa fecha.",
      );
    if (
      window &&
      other.kind === "work" &&
      new Date(window.startsAt) < other.endsAt! &&
      new Date(window.endsAt) > other.startsAt!
    )
      conflict("Ese horario se superpone con otro turno de la persona.");
  }
  const id = previous?.id ?? randomUUID();
  const values = {
    branchId: ctx.branchId,
    userId: input.userId,
    businessDate: input.businessDate,
    kind: input.kind,
    shiftId: input.kind === "off" ? null : (input.shiftId ?? null),
    name:
      input.kind === "off"
        ? "Franco"
        : (input.name ??
          (sameSnapshot
            ? previous!.name
            : (shift?.name ?? "Horario particular"))),
    startsAt: window ? new Date(window.startsAt) : null,
    endsAt: window ? new Date(window.endsAt) : null,
    pauseMinutes,
    timeZone: ctx.timeZone,
    revision: (previous?.revision ?? 0) + 1,
    reason: input.reason,
    updatedBy: ctx.actorId,
    updatedAt: now,
  };
  if (previous)
    await tx
      .update(attendanceAssignments)
      .set(values)
      .where(eq(attendanceAssignments.id, id));
  else await tx.insert(attendanceAssignments).values({ id, ...values });
  await audit(
    tx,
    ctx,
    "attendance_assignment",
    id,
    previous ?? null,
    values,
    now,
  );
  return { id, revision: values.revision };
}
function changesHash(events: EffectiveEvent[], changes: { eventId: string }[]) {
  const ids = new Set(changes.map((c) => c.eventId));
  return canonicalHash(
    events
      .filter((e) => ids.has(e.id))
      .map((e) => ({
        id: e.id,
        kind: e.kind,
        occurredAt: e.occurredAt.toISOString(),
        branchId: e.branchId,
        assignmentId: e.assignmentId,
      })),
  );
}
function corrected(
  events: EffectiveEvent[],
  changes: { eventId: string; occurredAt: string | null }[],
) {
  return events.flatMap((e) => {
    const change = changes.find((c) => c.eventId === e.id);
    return !change
      ? [e]
      : change.occurredAt === null
        ? []
        : [{ ...e, occurredAt: new Date(change.occurredAt) }];
  });
}
export async function runSchedulingCommand(
  tx: Tx,
  ctx: OperationalContext,
  command: AttendanceCommand,
  now: Date,
): Promise<Result> {
  if (command.action === "configure") {
    await requireAdministrator(tx, {
      id: ctx.actorId,
      role: ctx.role,
      branchId: ctx.branchId,
    });
    const [previous] = await tx
      .select()
      .from(attendanceSettings)
      .where(eq(attendanceSettings.branchId, ctx.branchId))
      .for("update");
    if ((previous?.revision ?? 0) !== command.expectedRevision) conflict();
    const centralAddress = await getSavedBranchAddress(tx, ctx.branchId);
    const latitude = centralAddress?.latitude ?? command.latitude;
    const longitude = centralAddress?.longitude ?? command.longitude;
    if (
      command.enabled &&
      (latitude === null ||
        longitude === null ||
        command.maxAccuracyMeters > command.radiusMeters)
    )
      throw new AppError(
        "VALIDATION",
        "Configurá coordenadas y una precisión máxima menor o igual al radio antes de habilitar el fichaje.",
        400,
      );
    const {
      action: _action,
      expectedRevision: _revision,
      ...settings
    } = command;
    void _action;
    void _revision;
    const values = {
      ...settings,
      latitude,
      longitude,
      revision: (previous?.revision ?? 0) + 1,
      updatedBy: ctx.actorId,
      updatedAt: now,
    };
    if (previous)
      await tx
        .update(attendanceSettings)
        .set(values)
        .where(eq(attendanceSettings.branchId, ctx.branchId));
    else {
      const [created] = await tx
        .insert(attendanceSettings)
        .values({ branchId: ctx.branchId, ...values })
        .onConflictDoNothing()
        .returning();
      if (!created) conflict();
    }
    if (!previous)
      for (const shift of [
        { name: "Mañana", start: "09:00", end: "17:00" },
        { name: "Tarde", start: "17:00", end: "23:00" },
      ])
        await tx.insert(attendanceShifts).values({
          branchId: ctx.branchId,
          ...shift,
          pauseMinutes: 30,
          updatedBy: ctx.actorId,
          updatedAt: now,
        });
    await audit(
      tx,
      ctx,
      "attendance_settings",
      ctx.branchId,
      previous ?? null,
      values,
      now,
    );
    return { id: ctx.branchId, revision: values.revision };
  }
  if (command.action === "participant") {
    await requireAdministrator(tx, {
      id: ctx.actorId,
      role: ctx.role,
      branchId: ctx.branchId,
    });
    if (command.enabled)
      await requireBranchEmployee(tx, ctx.branchId, command.userId);
    await tx
      .insert(attendanceParticipants)
      .values({
        branchId: ctx.branchId,
        userId: command.userId,
        enabled: command.enabled,
        updatedBy: ctx.actorId,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: [
          attendanceParticipants.branchId,
          attendanceParticipants.userId,
        ],
        set: {
          enabled: command.enabled,
          updatedBy: ctx.actorId,
          updatedAt: now,
        },
      });
    return {
      id: randomUUID(),
      userId: command.userId,
      enabled: command.enabled,
    };
  }
  if (command.action === "saveShift") {
    const [previous] = command.id
      ? await tx
          .select()
          .from(attendanceShifts)
          .where(eq(attendanceShifts.id, command.id))
          .for("update")
      : [];
    if (command.id && (!previous || previous.branchId !== ctx.branchId))
      throw new AppError("NOT_FOUND", "El turno no está disponible.", 404);
    if (previous && previous.revision !== command.expectedRevision) conflict();
    const hm = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
    const minutes =
      hm(command.end) - hm(command.start) + (command.overnight ? 1440 : 0);
    if (minutes <= 0 || minutes >= 1440 || command.pauseMinutes >= minutes)
      throw new AppError(
        "VALIDATION",
        "Revisá la duración del turno y su pausa.",
        400,
      );
    const id = previous?.id ?? randomUUID();
    const values = {
      name: command.name,
      start: command.start,
      end: command.end,
      overnight: command.overnight,
      pauseMinutes: command.pauseMinutes,
      active: command.active,
      revision: (previous?.revision ?? 0) + 1,
      updatedBy: ctx.actorId,
      updatedAt: now,
    };
    if (previous)
      await tx
        .update(attendanceShifts)
        .set(values)
        .where(eq(attendanceShifts.id, id));
    else
      await tx
        .insert(attendanceShifts)
        .values({ id, branchId: ctx.branchId, ...values });
    await audit(tx, ctx, "attendance_shift", id, previous ?? null, values, now);
    return { id, revision: values.revision };
  }
  if (command.action === "assign") return assignDay(tx, ctx, command, now);
  if (command.action === "cancelAssignment") {
    const [previous] = await tx
      .select()
      .from(attendanceAssignments)
      .where(eq(attendanceAssignments.id, command.id))
      .for("update");
    if (!previous || previous.branchId !== ctx.branchId || previous.canceledAt)
      throw new AppError("NOT_FOUND", "El horario ya no está disponible.", 404);
    if (previous.revision !== command.expectedRevision) conflict();
    const after = {
      canceledAt: now,
      reason: command.reason,
      revision: previous.revision + 1,
      updatedAt: now,
      updatedBy: ctx.actorId,
    };
    await tx
      .update(attendanceAssignments)
      .set(after)
      .where(eq(attendanceAssignments.id, previous.id));
    await audit(
      tx,
      ctx,
      "attendance_assignment",
      previous.id,
      previous,
      after,
      now,
    );
    return { id: previous.id, revision: after.revision };
  }
  if (command.action === "copyWeek") {
    for (const date of [command.sourceMonday, command.targetMonday])
      if (
        !validLocalDate(date) ||
        new Date(date + "T12:00:00Z").getUTCDay() !== 1
      )
        throw new AppError("VALIDATION", "Elegí el lunes de cada semana.", 400);
    const all = await tx
      .select()
      .from(attendanceAssignments)
      .where(
        and(
          eq(attendanceAssignments.branchId, ctx.branchId),
          isNull(attendanceAssignments.canceledAt),
        ),
      );
    const punches = await tx
      .select({
        userId: attendanceEvents.userId,
        date: attendanceEvents.businessDate,
      })
      .from(attendanceEvents)
      .where(eq(attendanceEvents.branchId, ctx.branchId));
    const occupied = new Set([
      ...all.map((a) => a.userId + ":" + a.businessDate),
      ...punches.map((p) => p.userId + ":" + p.date),
    ]);
    let copied = 0,
      skipped = 0;
    const source = all.filter(
      (a) =>
        a.businessDate >= command.sourceMonday &&
        a.businessDate <= addDays(command.sourceMonday, 6) &&
        (!command.userIds || command.userIds.includes(a.userId)),
    );
    for (const row of source) {
      const offset = Math.round(
        (Date.parse(row.businessDate) - Date.parse(command.sourceMonday)) /
          86400000,
      );
      const date = addDays(command.targetMonday, offset);
      if (occupied.has(row.userId + ":" + date)) {
        skipped++;
        continue;
      }
      const [participant] = await tx
        .select()
        .from(attendanceParticipants)
        .where(
          and(
            eq(attendanceParticipants.userId, row.userId),
            eq(attendanceParticipants.branchId, ctx.branchId),
          ),
        );
      if (!participant?.enabled) {
        skipped++;
        continue;
      }
      await assignDay(
        tx,
        ctx,
        {
          action: "assign",
          userId: row.userId,
          businessDate: date,
          kind: row.kind,
          name: row.name,
          start: row.startsAt
            ? localSchedule(row.startsAt.toISOString(), row.timeZone).slice(11)
            : undefined,
          end: row.endsAt
            ? localSchedule(row.endsAt.toISOString(), row.timeZone).slice(11)
            : undefined,
          overnight: row.endsAt
            ? localSchedule(row.endsAt.toISOString(), row.timeZone).slice(
                0,
                10,
              ) !== row.businessDate
            : false,
          pauseMinutes: row.pauseMinutes,
          reason: "",
        },
        now,
      );
      copied++;
    }
    return { id: randomUUID(), copied, skipped };
  }
  if (command.action === "requestCorrection") {
    if (ctx.role === "staff" && command.userId !== ctx.actorId)
      throw new AppError(
        "FORBIDDEN",
        "Solo podés solicitar correcciones de tus propios fichajes.",
        403,
      );
    const events = await effectiveEvents(tx, command.userId);
    if (
      new Set(command.changes.map((c) => c.eventId)).size !==
      command.changes.length
    )
      throw new AppError(
        "VALIDATION",
        "No repitas un fichaje en la corrección.",
        400,
      );
    for (const change of command.changes) {
      const event = events.find(
        (e) => e.id === change.eventId && e.branchId === ctx.branchId,
      );
      if (!event || (change.occurredAt && new Date(change.occurredAt) > now))
        throw new AppError(
          "VALIDATION",
          "La corrección contiene un fichaje ajeno, no disponible o una hora futura.",
          400,
        );
    }
    validateTimeline(corrected(events, command.changes));
    const id = randomUUID();
    await tx.insert(attendanceCorrections).values({
      id,
      branchId: ctx.branchId,
      userId: command.userId,
      changes: command.changes,
      originalHash: changesHash(events, command.changes),
      reason: command.reason,
      requestedBy: ctx.actorId,
      requestedAt: now,
    });
    return { id, status: "pending" };
  }
  if (command.action === "resolveCorrection") {
    requireAttendanceManager(ctx);
    const [request] = await tx
      .select()
      .from(attendanceCorrections)
      .where(eq(attendanceCorrections.id, command.id))
      .for("update");
    if (
      !request ||
      request.branchId !== ctx.branchId ||
      request.status !== "pending"
    )
      conflict("La solicitud ya no está pendiente.");
    if (
      request.requestedBy === ctx.actorId ||
      (ctx.role !== "admin" && request.userId === ctx.actorId)
    )
      throw new AppError(
        "FORBIDDEN",
        "Otra persona autorizada debe revisar esta corrección. Las propias del encargado requieren Administración.",
        403,
      );
    if (command.approve) {
      const events = await effectiveEvents(tx, request.userId);
      if (changesHash(events, request.changes) !== request.originalHash)
        conflict(
          "Los fichajes incluidos cambiaron. Volvé a revisar y solicitar la corrección.",
        );
      validateTimeline(corrected(events, request.changes));
    }
    await tx
      .update(attendanceCorrections)
      .set({
        status: command.approve ? "approved" : "rejected",
        resolvedBy: ctx.actorId,
        resolvedAt: now,
        resolutionReason: command.reason,
      })
      .where(eq(attendanceCorrections.id, request.id));
    return {
      id: request.id,
      status: command.approve ? "approved" : "rejected",
    };
  }
  if (command.action === "linkAssignment") {
    requireAttendanceManager(ctx);
    const [entry] = await tx
      .select()
      .from(attendanceEvents)
      .where(eq(attendanceEvents.id, command.entryId));
    if (!entry || entry.branchId !== ctx.branchId || entry.kind !== "entry")
      throw new AppError(
        "NOT_FOUND",
        "La entrada no está disponible en esta sucursal.",
        404,
      );
    const current = (await effectiveEvents(tx, entry.userId)).find(
      (e) => e.id === entry.id,
    );
    if (!current) conflict("La entrada fue anulada.");
    await entryReference(
      tx,
      ctx,
      entry.userId,
      current.occurredAt,
      command.assignmentId,
    );
    const [previous] = await tx
      .select()
      .from(attendanceEventLinks)
      .where(eq(attendanceEventLinks.entryId, entry.id));
    const values = {
      assignmentId: command.assignmentId,
      reason: command.reason,
      linkedBy: ctx.actorId,
      linkedAt: now,
    };
    await tx
      .insert(attendanceEventLinks)
      .values({ entryId: entry.id, ...values })
      .onConflictDoUpdate({
        target: attendanceEventLinks.entryId,
        set: values,
      });
    await audit(
      tx,
      ctx,
      "attendance_assignment_link",
      entry.id,
      previous ?? { assignmentId: entry.assignmentId },
      values,
      now,
    );
    return { id: entry.id };
  }
  throw new AppError("VALIDATION", "La operación no está disponible.", 400);
}
