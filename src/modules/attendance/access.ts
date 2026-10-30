import { and, eq, isNull } from "drizzle-orm";
import type { Tx } from "@/db/types";
import type { AppDb } from "@/db/client";
import { user, operationalUsers } from "@/db/auth-schema";
import { branchMemberships } from "@/db/branch-schema";
import {
  attendanceParticipants,
  attendanceSettings,
} from "@/db/attendance-schema";
import type { OperationalContext } from "@/modules/operations/types";
import { AppError } from "@/lib/errors";
import { getStoreProfile } from "@/modules/workplace/access";
export function requireAttendanceManager(ctx: OperationalContext) {
  if (ctx.role === "staff")
    throw new AppError(
      "FORBIDDEN",
      "Esta acción requiere permiso de encargado o administrador.",
      403,
    );
}
export async function requireParticipant(
  tx: Tx,
  branchId: string,
  userId: string,
) {
  await requireBranchEmployee(tx, branchId, userId);
  const [participant] = await tx
    .select()
    .from(attendanceParticipants)
    .where(
      and(
        eq(attendanceParticipants.branchId, branchId),
        eq(attendanceParticipants.userId, userId),
      ),
    );
  if (!participant?.enabled)
    throw new AppError(
      "ATTENDANCE_PARTICIPANT",
      "Esta persona no tiene habilitado el fichaje en la sucursal. Consultá con Administración.",
      403,
    );
}
export async function requireBranchEmployee(
  tx: Tx,
  branchId: string,
  userId: string,
) {
  if (await getStoreProfile(tx, userId))
    throw new AppError(
      "ATTENDANCE_PERSONAL_ACCOUNT",
      "El fichaje y los horarios corresponden a cuentas personales, no a la cuenta del local.",
      403,
    );
  const [profile] = await tx
    .select({
      disabled: operationalUsers.disabled,
      role: operationalUsers.role,
    })
    .from(operationalUsers)
    .innerJoin(user, eq(user.id, operationalUsers.userId))
    .where(eq(operationalUsers.userId, userId));
  const [membership] = await tx
    .select()
    .from(branchMemberships)
    .where(
      and(
        eq(branchMemberships.branchId, branchId),
        eq(branchMemberships.userId, userId),
        isNull(branchMemberships.revokedAt),
      ),
    );
  if (!profile || profile.disabled || (profile.role !== "admin" && !membership))
    throw new AppError(
      "ATTENDANCE_PARTICIPANT",
      "Esta persona no tiene habilitado el fichaje en la sucursal. Consultá con Administración.",
      403,
    );
}
export async function getAttendancePolicy(
  tx: AppDb | Tx,
  branchId: string,
  lock = false,
) {
  const query = tx
    .select()
    .from(attendanceSettings)
    .where(eq(attendanceSettings.branchId, branchId));
  const [row] = lock ? await query.for("update") : await query;
  if (!row)
    throw new AppError(
      "ATTENDANCE_NOT_CONFIGURED",
      "Administración debe configurar Asistencia en esta sucursal.",
      409,
    );
  return row;
}
