import { and, eq, isNull, asc } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/db/client";
import { user, operationalUsers } from "@/db/auth-schema";
import { branches, branchMemberships } from "@/db/branch-schema";
import {
  attendanceSettings,
  attendanceParticipants,
  attendanceShifts,
  attendanceAssignments,
  attendanceManualRequests,
  attendanceCorrections,
  attendanceEvents,
} from "@/db/attendance-schema";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { requireOperationalContext } from "@/modules/branches/context";
import { getStoreProfile } from "@/modules/workplace/access";
import { localSchedule } from "@/modules/production/schedule-time";
import { unsealCode } from "@/modules/identity/crypto";
import { effectiveEvents, type EffectiveEvent } from "./events";
import { summarizeDays, correctionPreview } from "./reports";
import {
  summarizeAttendance,
  validateTimeline,
  validLocalDate,
  canEnterAssignment,
} from "./rules";
const filtersSchema = z
  .object({
    from: z.string().optional(),
    to: z.string().optional(),
    userId: z.string().max(100).optional(),
  })
  .strict();
export async function getAttendanceSnapshot(
  db: AppDb,
  actor: Actor,
  raw: unknown = {},
  now = new Date(),
) {
  const filters = filtersSchema.parse(raw);
  if (await getStoreProfile(db, actor.id))
    throw new AppError(
      "ATTENDANCE_PERSONAL_ACCOUNT",
      "Ingresá con tu cuenta personal para ver tu asistencia.",
      403,
    );
  return db.transaction(async (tx) => {
    const ctx = await requireOperationalContext(
      tx,
      actor,
      actor.branchId ?? "",
    );
    const [branch] = await tx
      .select()
      .from(branches)
      .where(eq(branches.id, ctx.branchId));
    const today = localSchedule(now.toISOString(), ctx.timeZone).slice(0, 10);
    const from = filters.from ?? today,
      to = filters.to ?? from;
    if (
      !validLocalDate(from) ||
      !validLocalDate(to) ||
      from > to ||
      Date.parse(to) - Date.parse(from) > 93 * 86400000
    )
      throw new AppError(
        "VALIDATION",
        "Elegí un período válido de hasta 93 días.",
        400,
      );
    if (ctx.role === "staff" && filters.userId && filters.userId !== actor.id)
      throw new AppError(
        "FORBIDDEN",
        "Solo podés consultar tu propia asistencia.",
        403,
      );
    const [policy] = await tx
      .select()
      .from(attendanceSettings)
      .where(eq(attendanceSettings.branchId, ctx.branchId));
    const profiles = await tx
      .select({
        id: user.id,
        name: user.name,
        disabled: operationalUsers.disabled,
        globalRole: operationalUsers.role,
        membershipRole: branchMemberships.role,
        participant: attendanceParticipants.enabled,
      })
      .from(user)
      .innerJoin(operationalUsers, eq(operationalUsers.userId, user.id))
      .leftJoin(
        branchMemberships,
        and(
          eq(branchMemberships.userId, user.id),
          eq(branchMemberships.branchId, ctx.branchId),
          isNull(branchMemberships.revokedAt),
        ),
      )
      .leftJoin(
        attendanceParticipants,
        and(
          eq(attendanceParticipants.userId, user.id),
          eq(attendanceParticipants.branchId, ctx.branchId),
        ),
      )
      .orderBy(asc(user.name));
    const people = profiles
      .filter(
        (p) =>
          (p.membershipRole ||
            p.participant !== null ||
            (ctx.role === "admin" && p.globalRole === "admin")) &&
          (ctx.role !== "staff" || p.id === actor.id) &&
          (!filters.userId || p.id === filters.userId),
      )
      .map((p) => ({
        id: p.id,
        name: p.name,
        role:
          p.globalRole === "admin" ? "admin" : (p.membershipRole ?? "staff"),
        enabled: !!p.participant,
        active: !p.disabled && (p.globalRole === "admin" || !!p.membershipRole),
      }));
    // Admins need their own record too when explicitly participating.
    if (!people.some((p) => p.id === actor.id) && ctx.role === "staff") {
      const profile = profiles.find((p) => p.id === actor.id)!;
      people.push({
        id: profile.id,
        name: profile.name,
        role: ctx.role,
        enabled: !!profile.participant,
        active: !profile.disabled,
      });
    }
    const visibleIds = new Set(people.map((p) => p.id));
    const originalEvents = (
      await tx
        .select({
          id: attendanceEvents.id,
          userId: attendanceEvents.userId,
          kind: attendanceEvents.kind,
          occurredAt: attendanceEvents.occurredAt,
          recordedAt: attendanceEvents.recordedAt,
          businessDate: attendanceEvents.businessDate,
          source: attendanceEvents.source,
          recordedBy: attendanceEvents.recordedBy,
        })
        .from(attendanceEvents)
        .where(eq(attendanceEvents.branchId, ctx.branchId))
    )
      .filter(
        (e) =>
          visibleIds.has(e.userId) &&
          e.businessDate >= from &&
          e.businessDate <= to,
      )
      .map((e) => ({
        ...e,
        occurredAt: e.occurredAt.toISOString(),
        recordedAt: e.recordedAt.toISOString(),
      }));
    const allEvents = (
      await Promise.all(people.map((p) => effectiveEvents(tx, p.id)))
    ).flat();
    const ownAll = allEvents.filter((e) => e.userId === actor.id);
    const current = validateTimeline(ownAll);
    const publicEvent = (e: EffectiveEvent) => ({
      id: e.id,
      userId: e.userId,
      kind: e.kind,
      occurredAt: e.occurredAt.toISOString(),
      recordedAt: e.recordedAt.toISOString(),
      businessDate: e.businessDate,
      source: e.source,
      recordedBy: e.recordedBy,
      manualRequestId: e.manualRequestId,
      assignmentId: e.assignmentId,
      correctionId: e.correctionId,
      originalOccurredAt: e.originalOccurredAt,
      locationVerified: e.source === "phone",
      ...(ctx.role === "admin" ? { evidence: e.evidence } : {}),
      branchId: e.branchId,
      sequence: e.sequence,
    });
    const events = allEvents
      .filter(
        (e) =>
          e.branchId === ctx.branchId &&
          e.businessDate >= from &&
          e.businessDate <= to,
      )
      .map(publicEvent);
    const journalDate =
      ownAll.find((e) => e.id === current.entryId)?.businessDate ?? today;
    const journalEvents = ownAll
      .filter(
        (e) => e.branchId === ctx.branchId && e.businessDate === journalDate,
      )
      .map(publicEvent);
    const totals = Object.fromEntries(
      people.map((p) => [
        p.id,
        summarizeDays(
          events.filter((e) => e.userId === p.id),
          now,
        ),
      ]),
    );
    const states = Object.fromEntries(
      people.map((p) => [
        p.id,
        validateTimeline(allEvents.filter((e) => e.userId === p.id)),
      ]),
    );
    const allRequests = await tx
      .select()
      .from(attendanceManualRequests)
      .where(eq(attendanceManualRequests.branchId, ctx.branchId));
    const manualRequests = allRequests
      .filter((r) => ctx.role !== "staff" || r.userId === actor.id)
      .map((r) => {
        const status =
          r.status === "approved" && r.expiresAt! <= now ? "expired" : r.status;
        let ownCode: string | undefined;
        let codeUnavailable = false;
        if (
          r.requestedBy === actor.id &&
          status === "approved" &&
          r.codeCipher
        ) {
          try {
            ownCode = unsealCode(
              r.codeCipher,
              r.id,
              process.env.BETTER_AUTH_SECRET ?? "",
            );
          } catch {
            codeUnavailable = true;
          }
        }
        return {
          id: r.id,
          userId: r.userId,
          kind: r.kind,
          occurredAt: r.occurredAt.toISOString(),
          reason: r.reason,
          requestedBy: r.requestedBy,
          requestedAt: r.requestedAt.toISOString(),
          status,
          approvedBy: r.approvedBy,
          decidedAt: r.decidedAt?.toISOString() ?? null,
          decisionReason: r.decisionReason,
          validityMinutes: r.validityMinutes,
          expiresAt: r.expiresAt?.toISOString() ?? null,
          usedAt: r.usedAt?.toISOString() ?? null,
          usedBy: r.usedBy,
          ...(ownCode ? { code: ownCode } : {}),
          ...(codeUnavailable ? { codeUnavailable: true } : {}),
        };
      });
    const shifts = await tx
      .select()
      .from(attendanceShifts)
      .where(eq(attendanceShifts.branchId, ctx.branchId));
    const assignmentRows = await tx
      .select()
      .from(attendanceAssignments)
      .where(
        and(
          eq(attendanceAssignments.branchId, ctx.branchId),
          isNull(attendanceAssignments.canceledAt),
        ),
      );
    const assignments = assignmentRows
      .filter(
        (a) =>
          visibleIds.has(a.userId) &&
          a.businessDate >= from &&
          a.businessDate <= to,
      )
      .map((a) => ({
        ...a,
        startsAt: a.startsAt?.toISOString() ?? null,
        endsAt: a.endsAt?.toISOString() ?? null,
        updatedAt: a.updatedAt.toISOString(),
        canceledAt: null,
      }));
    const entryAssignments = assignmentRows
      .filter((a) => a.userId === actor.id && canEnterAssignment(a, today, now))
      .sort((a, b) => a.startsAt!.getTime() - b.startsAt!.getTime())
      .map((a) => ({
        ...a,
        startsAt: a.startsAt?.toISOString() ?? null,
        endsAt: a.endsAt?.toISOString() ?? null,
        updatedAt: a.updatedAt.toISOString(),
        canceledAt: null,
      }));
    const ownJournal = {
      businessDate: journalDate,
      events: journalEvents,
      total: summarizeAttendance(journalEvents, now),
      assignments: assignmentRows
        .filter((a) => a.userId === actor.id && a.businessDate === journalDate)
        .map((a) => ({
          ...a,
          startsAt: a.startsAt?.toISOString() ?? null,
          endsAt: a.endsAt?.toISOString() ?? null,
          updatedAt: a.updatedAt.toISOString(),
          canceledAt: null,
        })),
    };
    const correctionRows = await tx
      .select()
      .from(attendanceCorrections)
      .where(eq(attendanceCorrections.branchId, ctx.branchId));
    const corrections = correctionRows
      .filter((r) => ctx.role !== "staff" || r.userId === actor.id)
      .map((r) => ({
        id: r.id,
        userId: r.userId,
        changes: r.changes,
        reason: r.reason,
        status: r.status,
        requestedBy: r.requestedBy,
        requestedAt: r.requestedAt.toISOString(),
        resolvedBy: r.resolvedBy,
        resolvedAt: r.resolvedAt?.toISOString() ?? null,
        resolutionReason: r.resolutionReason,
        preview:
          r.status === "pending"
            ? correctionPreview(
                allEvents.filter((e) => e.userId === r.userId),
                r.changes,
                now,
              )
            : null,
      }));
    return {
      ownJournal,
      entryAssignments,
      originalEvents,
      branch: { id: branch.id, name: branch.name, timeZone: ctx.timeZone },
      actor: {
        id: actor.id,
        role: ctx.role,
        name: profiles.find((p) => p.id === actor.id)?.name ?? "Equipo",
      },
      now: now.toISOString(),
      today,
      from,
      to,
      settings: policy
        ? {
            enabled: policy.enabled,
            latitude: policy.latitude,
            longitude: policy.longitude,
            radiusMeters: policy.radiusMeters,
            maxAccuracyMeters: policy.maxAccuracyMeters,
            codeValidityMinutes: policy.codeValidityMinutes,
            requireStepUp: policy.requireStepUp,
            revision: policy.revision,
          }
        : null,
      people,
      events,
      current,
      states,
      totals,
      manualRequests,
      shifts: shifts.map((s) => ({
        ...s,
        updatedAt: s.updatedAt.toISOString(),
      })),
      assignments,
      corrections,
    };
  });
}
export type AttendanceSnapshot = Awaited<
  ReturnType<typeof getAttendanceSnapshot>
>;
