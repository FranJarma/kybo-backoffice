import { and, eq, isNull, lte, gt, sql } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import { operationalUsers, session } from "@/db/auth-schema";
import {
  attendanceAssignments,
  attendanceParticipants,
} from "@/db/attendance-schema";
import { preparationStations } from "@/db/preparation-schema";
import {
  workplaceStoreAccounts,
  workplaceStationAssignments,
} from "@/db/workplace-schema";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { requireOperationalContext } from "@/modules/branches/context";

export async function workplaceSchemaReady(db: AppDb | Tx) {
  const result = await db.execute(
    sql`select to_regclass('public.workplace_store_accounts') is not null and to_regclass('public.workplace_management_authorizations') is not null and to_regclass('public.workplace_management_limits') is not null and to_regclass('public.workplace_plans') is not null and to_regclass('public.workplace_station_assignments') is not null as ready`,
  );
  return result.rows[0]?.ready === true;
}
export async function getStoreProfile(db: AppDb | Tx, userId: string) {
  const available = await db.execute(
    sql`select to_regclass('public.workplace_store_accounts') is not null as ready`,
  );
  if (available.rows[0]?.ready !== true) return null;
  const [profile] = await db
    .select({
      userId: workplaceStoreAccounts.userId,
      branchId: workplaceStoreAccounts.branchId,
      enabled: workplaceStoreAccounts.enabled,
    })
    .from(workplaceStoreAccounts)
    .where(eq(workplaceStoreAccounts.userId, userId));
  return profile ?? null;
}
export async function requireStoreAccount(
  db: AppDb | Tx,
  actor: Actor,
  now = new Date(),
) {
  const profile = await getStoreProfile(db, actor.id);
  if (
    !profile?.enabled ||
    !actor.sessionId ||
    (actor.branchId && actor.branchId !== profile.branchId) ||
    (actor.storeBranchId && actor.storeBranchId !== profile.branchId)
  )
    throw new AppError(
      "FORBIDDEN",
      "El acceso del puesto no está habilitado para esta sucursal.",
      403,
    );
  const [liveSession] = await db
    .select()
    .from(session)
    .where(
      and(
        eq(session.id, actor.sessionId),
        eq(session.userId, actor.id),
        gt(session.expiresAt, now),
      ),
    )
    .for("share");
  const [account] = await db
    .select()
    .from(operationalUsers)
    .where(eq(operationalUsers.userId, actor.id))
    .for("share");
  const [lockedProfile] = await db
    .select()
    .from(workplaceStoreAccounts)
    .where(eq(workplaceStoreAccounts.userId, actor.id))
    .for("share");
  if (
    !liveSession ||
    !lockedProfile?.enabled ||
    lockedProfile.branchId !== profile.branchId ||
    !account ||
    account.disabled ||
    account.role !== "staff" ||
    account.catalogManager
  )
    throw new AppError(
      "FORBIDDEN",
      "Iniciá nuevamente la cuenta limitada del local.",
      403,
    );
  const ctx = await requireOperationalContext(db, actor, profile.branchId);
  if (ctx.role !== "staff")
    throw new AppError(
      "FORBIDDEN",
      "La cuenta del local debe conservar permisos limitados.",
      403,
    );
  return { ...profile, sessionId: liveSession.id, timeZone: ctx.timeZone };
}

export type PersonalStationAssignment = {
  assignmentId: string;
  stationId: string | null;
  stationName: string;
  businessDate: string;
  startsAt: Date;
  endsAt: Date;
};
/** Current frozen instants only: startsAt <= now < endsAt, including overnight.
 * No early-entry grace or future schedule confers preparation permissions.
 * In a command transaction, lock:true retains the assignment rows until commit.
 */
export async function getPersonalStations(
  db: AppDb | Tx,
  actor: Actor,
  now = new Date(),
  options: { lock?: boolean } = {},
): Promise<PersonalStationAssignment[]> {
  if (!(await workplaceSchemaReady(db))) return [];
  if (await getStoreProfile(db, actor.id))
    throw new AppError(
      "FORBIDDEN",
      "El puesto compartido no tiene tareas personales.",
      403,
    );
  const ctx = await requireOperationalContext(db, actor, actor.branchId ?? "");
  const [participant] = await db
    .select()
    .from(attendanceParticipants)
    .where(
      and(
        eq(attendanceParticipants.userId, actor.id),
        eq(attendanceParticipants.branchId, ctx.branchId),
        eq(attendanceParticipants.enabled, true),
      ),
    );
  if (!participant) return [];
  // Read the mutable plan links under the same lock that saving takes.
  const plan = db
    .select()
    .from(workplaceStationAssignments)
    .where(eq(workplaceStationAssignments.branchId, ctx.branchId));
  const links = options.lock ? await plan.for("share") : await plan;
  const query = db
    .select()
    .from(attendanceAssignments)
    .where(
      and(
        eq(attendanceAssignments.branchId, ctx.branchId),
        eq(attendanceAssignments.userId, actor.id),
        eq(attendanceAssignments.kind, "work"),
        isNull(attendanceAssignments.canceledAt),
        lte(attendanceAssignments.startsAt, now),
        gt(attendanceAssignments.endsAt, now),
      ),
    );
  const rows = options.lock ? await query.for("share") : await query;
  const stations = await db
    .select()
    .from(preparationStations)
    .where(
      and(
        eq(preparationStations.branchId, ctx.branchId),
        isNull(preparationStations.archivedAt),
      ),
    );
  return rows.flatMap((a) => {
    const link = links.find((l) => l.assignmentId === a.id);
    const station = link?.stationId
      ? stations.find((s) => s.id === link.stationId)
      : null;
    if (!link || (link.stationId && !station)) return [];
    return [
      {
        assignmentId: a.id,
        stationId: link.stationId,
        stationName: station?.name ?? "Punto de venta",
        businessDate: a.businessDate,
        startsAt: a.startsAt!,
        endsAt: a.endsAt!,
      },
    ];
  });
}
