import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import { verifyPassword } from "better-auth/crypto";
import { and, asc, eq, isNull, or, sql, lte, gt } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import { account, operationalUsers, user } from "@/db/auth-schema";
import { branchMemberships } from "@/db/branch-schema";
import {
  attendanceAssignments,
  attendanceParticipants,
  attendanceShifts,
  attendanceManualRequests,
} from "@/db/attendance-schema";
import { preparationStations } from "@/db/preparation-schema";
import { auditEvents } from "@/db/business-schema";
import {
  workplaceManagementAuthorizations as grants,
  workplaceManagementLimits as limits,
  workplacePlans as plans,
  workplaceStationAssignments as links,
  workplaceStoreAccounts as stores,
} from "@/db/workplace-schema";
import type { Actor } from "@/lib/access";
import { provisionUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { requireOperationalContext } from "@/modules/branches/context";
import {
  lockUserAdministration,
  requireUserAdministrator,
} from "@/modules/users/service";
import { lockIdentity } from "@/modules/identity/service";
import { canonicalHash } from "@/modules/identity/crypto";
import { assignDay } from "@/modules/attendance/scheduling";
import { requireParticipant } from "@/modules/attendance/access";
import { runAttendanceCommand } from "@/modules/attendance/service";
import {
  getStoreProfile,
  requireStoreAccount,
  workplaceSchemaReady,
} from "./access";
import {
  authorizationInput,
  managementCommand,
  storeAccountInput,
  type ManagementCommand,
} from "./validation";
export {
  workplaceSchemaReady,
  getStoreProfile,
  requireStoreAccount,
  getPersonalStations,
} from "./access";

const denied = () =>
  new AppError(
    "WORKPLACE_AUTHORIZATION",
    "La autorización terminó. Volvé a autorizar la gestión con tu cuenta personal.",
    403,
  );
const digest = (value: string) =>
  createHash("sha256").update(value).digest("hex");
async function ready(db: AppDb | Tx) {
  if (!(await workplaceSchemaReady(db)))
    throw new AppError(
      "WORKPLACE_SETUP",
      "Administración debe completar la activación del puesto del local.",
      503,
    );
}
async function managerIdentity(db: AppDb | Tx, id: string, branchId: string) {
  const [profile] = await db
    .select({
      id: user.id,
      name: user.name,
      role: operationalUsers.role,
      disabled: operationalUsers.disabled,
      accessUpdatedAt: operationalUsers.updatedAt,
      password: account.password,
      credentialUpdatedAt: account.updatedAt,
    })
    .from(user)
    .innerJoin(operationalUsers, eq(operationalUsers.userId, user.id))
    .innerJoin(
      account,
      and(eq(account.userId, user.id), eq(account.providerId, "credential")),
    )
    .where(eq(user.id, id))
    .for("share");
  if (
    !profile ||
    profile.disabled ||
    !profile.password ||
    (await getStoreProfile(db, id))
  )
    throw denied();
  const actor: Actor = {
    id,
    role: profile.role,
    branchId,
    accountKind: "personal",
  };
  const ctx = await requireOperationalContext(db, actor, branchId);
  if (ctx.role !== "manager" && ctx.role !== "admin") throw denied();
  return {
    profile,
    actor: { ...actor, role: ctx.role },
    ctx,
    version: digest(
      [
        profile.password,
        profile.credentialUpdatedAt.toISOString(),
        profile.accessUpdatedAt.toISOString(),
        ctx.role,
      ].join("|"),
    ),
  };
}

/** Password verification does not create a personal login or touch the POS cookie. */
export async function authorizeManagement(
  db: AppDb,
  storeActor: Actor,
  raw: unknown,
  now = new Date(),
) {
  const input = authorizationInput.parse(raw);
  await ready(db);
  const result = await db.transaction(async (tx) => {
    const store = await requireStoreAccount(tx, storeActor, now);
    await tx
      .insert(limits)
      .values({
        storeUserId: storeActor.id,
        sessionId: store.sessionId,
        windowAt: now,
      })
      .onConflictDoNothing();
    const [limit] = await tx
      .select()
      .from(limits)
      .where(eq(limits.storeUserId, storeActor.id))
      .for("update");
    if (limit.blockedUntil && limit.blockedUntil > now)
      return {
        ok: false as const,
        error: new AppError(
          "WORKPLACE_RATE_LIMIT",
          "Esperá 15 minutos antes de volver a autorizar la gestión.",
          429,
        ),
      };
    const [candidate] = await tx
      .select({ id: user.id })
      .from(user)
      .where(
        or(
          sql`lower(${user.username})=${input.identifier}`,
          sql`lower(${user.email})=${input.identifier}`,
        ),
      )
      .limit(1);
    let manager: Awaited<ReturnType<typeof managerIdentity>> | undefined;
    if (candidate) {
      try {
        manager = await managerIdentity(tx, candidate.id, store.branchId);
      } catch (error) {
        if (!(error instanceof AppError) || error.status !== 403) throw error;
      }
    }
    const correct = manager
      ? await verifyPassword({
          hash: manager.profile.password!,
          password: input.password,
        })
      : false;
    if (!correct || !manager) {
      const failures =
        now.getTime() - limit.windowAt.getTime() < 900000
          ? limit.failures + 1
          : 1;
      await tx
        .update(limits)
        .set({
          failures,
          windowAt: failures === 1 ? now : limit.windowAt,
          blockedUntil: failures >= 5 ? new Date(now.getTime() + 900000) : null,
        })
        .where(eq(limits.storeUserId, storeActor.id));
      // Return the failure so its throttle update commits before throwing.
      return {
        ok: false as const,
        error: new AppError(
          "WORKPLACE_PASSWORD",
          "No pudimos autorizar. Revisá tu usuario, contraseña y acceso de encargada a este local.",
          401,
        ),
      };
    }
    await tx
      .update(limits)
      .set({ failures: 0, windowAt: now, blockedUntil: null })
      .where(eq(limits.storeUserId, storeActor.id));
    const token = randomBytes(32).toString("base64url"),
      id = randomUUID(),
      expiresAt = new Date(now.getTime() + 600000);
    await tx
      .update(grants)
      .set({ revokedAt: now })
      .where(
        and(eq(grants.sessionId, store.sessionId), isNull(grants.revokedAt)),
      );
    await tx.insert(grants).values({
      id,
      tokenHash: digest(token),
      sessionId: store.sessionId,
      storeUserId: storeActor.id,
      managerUserId: manager.actor.id,
      branchId: store.branchId,
      credentialVersion: manager.version,
      createdAt: now,
      expiresAt,
    });
    await tx.insert(auditEvents).values({
      actorId: manager.actor.id,
      entity: "workplace-management",
      recordId: id,
      action: "authorize",
      after: {
        storeUserId: storeActor.id,
        branchId: store.branchId,
        expiresAt: expiresAt.toISOString(),
        scope: ["station-planning", "requestManual", "redeemManual"],
      },
      createdAt: now,
    });
    return {
      ok: true as const,
      token,
      managerId: manager.actor.id,
      managerName: manager.profile.name,
      expiresAt: expiresAt.toISOString(),
    };
  });
  if (!result.ok) throw result.error;
  return {
    token: result.token,
    managerId: result.managerId,
    managerName: result.managerName,
    expiresAt: result.expiresAt,
  };
}

async function authorized(
  tx: Tx,
  actor: Actor,
  token: string,
  now: Date,
  replay?: Extract<ManagementCommand, { action: "save" }>,
) {
  const store = await requireStoreAccount(tx, actor, now);
  if (!/^[\w-]{43}$/.test(token)) throw denied();
  const [grant] = await tx
    .select()
    .from(grants)
    .where(eq(grants.tokenHash, digest(token)))
    .for("update");
  if (
    !grant ||
    grant.sessionId !== store.sessionId ||
    grant.storeUserId !== actor.id ||
    grant.branchId !== store.branchId ||
    grant.expiresAt <= now
  )
    throw denied();
  const sameSave =
    replay &&
    grant.savedRequestId === replay.requestId &&
    grant.savedFingerprint === canonicalHash(replay);
  if (grant.revokedAt && !sameSave) throw denied();
  const manager = await managerIdentity(
    tx,
    grant.managerUserId,
    grant.branchId,
  );
  if (manager.version !== grant.credentialVersion) throw denied();
  return { grant, store, manager };
}

export async function createStoreAccount(
  db: AppDb,
  actor: Actor,
  raw: unknown,
) {
  const input = storeAccountInput.parse(raw);
  await requireUserAdministrator(db, actor);
  await ready(db);
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new AppError(
      "UNAVAILABLE",
      "La autenticación no está configurada.",
      503,
    );
  const fingerprint = createHmac("sha256", secret)
    .update(JSON.stringify(input))
    .digest("hex");
  return db.transaction(async (tx) => {
    await lockUserAdministration(tx, actor);
    const [prior] = await tx
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.entity, "workplace-store-create"),
          eq(auditEvents.recordId, input.requestId),
        ),
      );
    if (prior) {
      const result = prior.after as { id: string; fingerprint: string };
      if (prior.actorId !== actor.id || result.fingerprint !== fingerprint)
        throw new AppError(
          "IDEMPOTENCY_CONFLICT",
          "La clave corresponde a otra cuenta.",
          409,
        );
      return { id: result.id, replayed: true };
    }
    const id = await provisionUser(tx, {
      name: input.name,
      username: input.username,
      password: input.password,
      role: "staff",
      branchId: input.branchId,
    });
    await tx.insert(stores).values({
      userId: id,
      branchId: input.branchId,
      enabled: true,
      createdBy: actor.id,
    });
    await tx.insert(auditEvents).values({
      actorId: actor.id,
      entity: "workplace-store-create",
      recordId: input.requestId,
      action: "create",
      after: { id, branchId: input.branchId, fingerprint },
    });
    return { id, replayed: false };
  });
}

async function personalParticipant(tx: Tx, branchId: string, userId: string) {
  if (await getStoreProfile(tx, userId))
    throw new AppError(
      "FORBIDDEN",
      "Elegí una cuenta personal habilitada para Asistencia.",
      403,
    );
  await requireParticipant(tx, branchId, userId);
}

export async function getManagementSnapshot(
  db: AppDb,
  actor: Actor,
  token: string,
  businessDate: string,
  now = new Date(),
) {
  z.iso.date().parse(businessDate);
  return db.transaction(async (tx) => {
    const { manager, store, grant } = await authorized(tx, actor, token, now);
    const [plan] = await tx
      .select()
      .from(plans)
      .where(
        and(
          eq(plans.branchId, store.branchId),
          eq(plans.businessDate, businessDate),
        ),
      );
    const people = await tx
      .select({ id: user.id, name: user.name })
      .from(user)
      .innerJoin(
        operationalUsers,
        and(
          eq(operationalUsers.userId, user.id),
          eq(operationalUsers.disabled, false),
        ),
      )
      .innerJoin(
        attendanceParticipants,
        and(
          eq(attendanceParticipants.userId, user.id),
          eq(attendanceParticipants.branchId, store.branchId),
          eq(attendanceParticipants.enabled, true),
        ),
      )
      .leftJoin(
        branchMemberships,
        and(
          eq(branchMemberships.userId, user.id),
          eq(branchMemberships.branchId, store.branchId),
          isNull(branchMemberships.revokedAt),
        ),
      )
      .leftJoin(stores, eq(stores.userId, user.id))
      .where(
        and(
          isNull(stores.userId),
          or(
            eq(operationalUsers.role, "admin"),
            sql`${branchMemberships.userId} is not null`,
          ),
        ),
      )
      .orderBy(asc(user.name));
    const shifts = await tx
      .select()
      .from(attendanceShifts)
      .where(
        and(
          eq(attendanceShifts.branchId, store.branchId),
          eq(attendanceShifts.active, true),
        ),
      )
      .orderBy(asc(attendanceShifts.start));
    const stations = await tx
      .select({ id: preparationStations.id, name: preparationStations.name })
      .from(preparationStations)
      .where(
        and(
          eq(preparationStations.branchId, store.branchId),
          isNull(preparationStations.archivedAt),
        ),
      )
      .orderBy(asc(preparationStations.name));
    const assignments = await tx
      .select()
      .from(attendanceAssignments)
      .where(
        and(
          eq(attendanceAssignments.branchId, store.branchId),
          eq(attendanceAssignments.businessDate, businessDate),
          eq(attendanceAssignments.kind, "work"),
          isNull(attendanceAssignments.canceledAt),
        ),
      );
    const stationLinks = await tx
      .select()
      .from(links)
      .where(eq(links.branchId, store.branchId));
    const rows = stationLinks.flatMap((l) => {
      const a = assignments.find((a) => a.id === l.assignmentId);
      return a
        ? [
            {
              assignmentId: a.id,
              userId: a.userId,
              shiftId: a.shiftId ?? undefined,
              stationId: l.stationId,
              startsAt: a.startsAt!.toISOString(),
              endsAt: a.endsAt!.toISOString(),
              name: a.name,
            },
          ]
        : [];
    });
    const manualRequests = await tx
      .select({
        id: attendanceManualRequests.id,
        userId: attendanceManualRequests.userId,
        kind: attendanceManualRequests.kind,
        status: attendanceManualRequests.status,
        occurredAt: attendanceManualRequests.occurredAt,
        reason: attendanceManualRequests.reason,
        expiresAt: attendanceManualRequests.expiresAt,
      })
      .from(attendanceManualRequests)
      .where(
        and(
          eq(attendanceManualRequests.branchId, store.branchId),
          eq(attendanceManualRequests.requestedBy, manager.actor.id),
        ),
      )
      .orderBy(asc(attendanceManualRequests.requestedAt));
    return {
      managerId: manager.actor.id,
      managerName: manager.profile.name,
      expiresAt: grant.expiresAt.toISOString(),
      branchId: store.branchId,
      timeZone: store.timeZone,
      businessDate,
      revision: plan?.revision ?? 0,
      people,
      shifts: shifts.map((s) => ({
        id: s.id,
        name: s.name,
        start: s.start,
        end: s.end,
        overnight: s.overnight,
        pauseMinutes: s.pauseMinutes,
      })),
      stations,
      rows,
      schedules: assignments.map((a) => ({
        id: a.id,
        userId: a.userId,
        shiftId: a.shiftId,
        name: a.name,
        startsAt: a.startsAt!.toISOString(),
        endsAt: a.endsAt!.toISOString(),
      })),
      manualRequests,
    };
  });
}
export type ManagementSnapshot = Awaited<
  ReturnType<typeof getManagementSnapshot>
>;

/** Read-only POS context, deliberately independent of the management grant. */
export async function getWorkplaceSummary(
  db: AppDb,
  actor: Actor,
  now = new Date(),
) {
  await ready(db);
  return db.transaction(async (tx) => {
    const store = await requireStoreAccount(tx, actor, now);
    const assigned = await tx
      .select({
        personName: user.name,
        stationName: sql<string>`coalesce(${preparationStations.name}, 'Punto de venta')`,
        startsAt: attendanceAssignments.startsAt,
        endsAt: attendanceAssignments.endsAt,
      })
      .from(links)
      .innerJoin(
        attendanceAssignments,
        and(
          eq(attendanceAssignments.id, links.assignmentId),
          eq(attendanceAssignments.branchId, store.branchId),
          eq(attendanceAssignments.kind, "work"),
          isNull(attendanceAssignments.canceledAt),
          lte(attendanceAssignments.startsAt, now),
          gt(attendanceAssignments.endsAt, now),
        ),
      )
      .innerJoin(user, eq(user.id, attendanceAssignments.userId))
      .innerJoin(
        operationalUsers,
        and(
          eq(operationalUsers.userId, user.id),
          eq(operationalUsers.disabled, false),
        ),
      )
      .innerJoin(
        attendanceParticipants,
        and(
          eq(attendanceParticipants.userId, user.id),
          eq(attendanceParticipants.branchId, store.branchId),
          eq(attendanceParticipants.enabled, true),
        ),
      )
      .leftJoin(
        branchMemberships,
        and(
          eq(branchMemberships.userId, user.id),
          eq(branchMemberships.branchId, store.branchId),
          isNull(branchMemberships.revokedAt),
        ),
      )
      .leftJoin(stores, eq(stores.userId, user.id))
      .leftJoin(
        preparationStations,
        and(
          eq(preparationStations.id, links.stationId),
          eq(preparationStations.branchId, store.branchId),
          isNull(preparationStations.archivedAt),
        ),
      )
      .where(
        and(
          eq(links.branchId, store.branchId),
          isNull(stores.userId),
          or(
            eq(operationalUsers.role, "admin"),
            sql`${branchMemberships.userId} is not null`,
          ),
          or(
            isNull(links.stationId),
            sql`${preparationStations.id} is not null`,
          ),
        ),
      )
      .orderBy(asc(attendanceAssignments.startsAt), asc(user.name));
    return {
      branchId: store.branchId,
      timeZone: store.timeZone,
      now: now.toISOString(),
      rows: assigned.map((r) => ({
        personName: r.personName,
        stationName: r.stationName,
        startsAt: r.startsAt!.toISOString(),
        endsAt: r.endsAt!.toISOString(),
      })),
    };
  });
}
export type WorkplaceSummarySnapshot = Awaited<
  ReturnType<typeof getWorkplaceSummary>
>;

export async function runManagementCommand(
  db: AppDb,
  actor: Actor,
  token: string,
  raw: unknown,
  now = new Date(),
): Promise<Record<string, unknown>> {
  const command = managementCommand.parse(raw);
  const outcome = await db.transaction(async (tx) => {
    const { grant, store, manager } = await authorized(
      tx,
      actor,
      token,
      now,
      command.action === "save" ? command : undefined,
    );
    if (
      command.action === "save" &&
      grant.savedRequestId === command.requestId &&
      grant.savedResult
    )
      return { ...grant.savedResult, replayed: true };
    if (command.action === "exit") {
      await tx
        .update(grants)
        .set({ revokedAt: now })
        .where(eq(grants.id, grant.id));
      await tx.insert(auditEvents).values({
        actorId: manager.actor.id,
        entity: "workplace-management",
        recordId: grant.id,
        action: "exit",
        after: { storeUserId: actor.id, branchId: store.branchId },
        createdAt: now,
      });
      return { revoked: true };
    }
    if (command.action !== "save") {
      const { requestId, ...attendanceCommand } = command;
      if (command.action === "requestManual")
        await personalParticipant(tx, store.branchId, command.userId);
      let result: Awaited<ReturnType<typeof runAttendanceCommand>>;
      try {
        result = await runAttendanceCommand(
          tx as unknown as AppDb,
          manager.actor,
          requestId,
          attendanceCommand,
          now,
        );
      } catch (error) {
        // Attendance committed its failed-code counter in the nested savepoint.
        // Preserve that write while retaining this transaction's grant lock.
        if (
          error instanceof AppError &&
          error.code === "ATTENDANCE_CODE_INVALID"
        )
          return { failure: error };
        throw error;
      }
      await tx.insert(auditEvents).values({
        actorId: manager.actor.id,
        entity: "workplace-management",
        recordId: grant.id,
        action: command.action,
        after: { storeUserId: actor.id, branchId: store.branchId, requestId },
        createdAt: now,
      });
      return result;
    }
    await tx
      .insert(plans)
      .values({
        branchId: store.branchId,
        businessDate: command.businessDate,
        updatedBy: manager.actor.id,
        updatedAt: now,
      })
      .onConflictDoNothing();
    const [plan] = await tx
      .select()
      .from(plans)
      .where(
        and(
          eq(plans.branchId, store.branchId),
          eq(plans.businessDate, command.businessDate),
        ),
      )
      .for("update");
    if (plan.revision !== command.expectedRevision)
      throw new AppError(
        "REVISION_CONFLICT",
        "Otra persona cambió los puestos. Actualizá antes de guardar.",
        409,
      );
    const oldLinks = await tx
      .select()
      .from(links)
      .where(eq(links.branchId, store.branchId))
      .for("update");
    for (const id of [...new Set(command.rows.map((r) => r.userId))].sort())
      await lockIdentity(tx, id);
    const before = await tx
      .select()
      .from(attendanceAssignments)
      .where(
        and(
          eq(attendanceAssignments.branchId, store.branchId),
          eq(attendanceAssignments.businessDate, command.businessDate),
          isNull(attendanceAssignments.canceledAt),
        ),
      );
    const activeStations = await tx
      .select()
      .from(preparationStations)
      .where(
        and(
          eq(preparationStations.branchId, store.branchId),
          isNull(preparationStations.archivedAt),
        ),
      )
      .for("share");
    const saved: string[] = [];
    for (const row of command.rows) {
      await personalParticipant(tx, store.branchId, row.userId);
      if (row.stationId && !activeStations.some((s) => s.id === row.stationId))
        throw new AppError(
          "VALIDATION",
          "Elegí un puesto activo de esta sucursal.",
          400,
        );
      let assignment = row.assignmentId
        ? before.find(
            (a) =>
              a.id === row.assignmentId &&
              a.userId === row.userId &&
              a.kind === "work",
          )
        : before.find(
            (a) =>
              a.userId === row.userId &&
              a.shiftId === row.shiftId &&
              a.kind === "work",
          );
      if (row.assignmentId && !assignment)
        throw new AppError(
          "VALIDATION",
          "El horario de esta persona cambió. Actualizá la gestión.",
          409,
        );
      if (!assignment) {
        if (!row.shiftId)
          throw new AppError(
            "VALIDATION",
            "Elegí un horario configurado para cada responsable.",
            400,
          );
        const added = await assignDay(
          tx,
          manager.ctx,
          {
            action: "assign",
            userId: row.userId,
            businessDate: command.businessDate,
            kind: "work",
            shiftId: row.shiftId,
            reason: "",
          },
          now,
        );
        [assignment] = await tx
          .select()
          .from(attendanceAssignments)
          .where(eq(attendanceAssignments.id, added.id));
      }
      if (saved.includes(assignment.id))
        throw new AppError(
          "VALIDATION",
          "Cada tramo de la persona debe tener un solo puesto.",
          400,
        );
      saved.push(assignment.id);
      await tx
        .insert(links)
        .values({
          assignmentId: assignment.id,
          branchId: store.branchId,
          stationId: row.stationId,
          updatedBy: manager.actor.id,
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: links.assignmentId,
          set: {
            stationId: row.stationId,
            updatedBy: manager.actor.id,
            updatedAt: now,
          },
        });
    }
    for (const old of oldLinks)
      if (
        before.some((a) => a.id === old.assignmentId) &&
        !saved.includes(old.assignmentId)
      )
        await tx.delete(links).where(eq(links.assignmentId, old.assignmentId));
    const revision = plan.revision + 1;
    await tx
      .update(plans)
      .set({ revision, updatedBy: manager.actor.id, updatedAt: now })
      .where(
        and(
          eq(plans.branchId, store.branchId),
          eq(plans.businessDate, command.businessDate),
        ),
      );
    const result = { id: grant.id, revision, saved: true };
    await tx
      .update(grants)
      .set({
        revokedAt: now,
        savedRequestId: command.requestId,
        savedFingerprint: canonicalHash(command),
        savedResult: result,
      })
      .where(eq(grants.id, grant.id));
    await tx.insert(auditEvents).values({
      actorId: manager.actor.id,
      entity: "workplace-plan",
      recordId: command.requestId,
      action: "save",
      before: {
        revision: plan.revision,
        assignments: oldLinks.filter((l) =>
          before.some((a) => a.id === l.assignmentId),
        ),
      },
      after: {
        storeUserId: actor.id,
        branchId: store.branchId,
        businessDate: command.businessDate,
        revision,
        rows: command.rows,
      },
      createdAt: now,
    });
    return result;
  });
  if ("failure" in outcome && outcome.failure instanceof AppError)
    throw outcome.failure;
  return outcome;
}
