import { and, eq, gt, gte, sql } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { session } from "@/db/auth-schema";
import { attendanceQrAttempts } from "@/db/attendance-access-schema";
import { requireOperationalContext } from "@/modules/branches/context";
import { lockIdentity } from "@/modules/identity/service";
import { canonicalHash } from "@/modules/identity/crypto";
import { getStoreProfile } from "@/modules/workplace/access";
import { getAttendancePolicy, requireParticipant } from "./access";
import { readAttendanceQr } from "./qr-token";

export async function attendanceQrSchemaReady(db: AppDb | Tx) {
  const result = await db.execute(
    sql`select to_regclass('public.attendance_qr_attempts') is not null as ready`,
  );
  return result.rows[0]?.ready === true;
}
export async function requireQrAccessReady(db: AppDb | Tx) {
  if (!(await attendanceQrSchemaReady(db)))
    throw new AppError(
      "ATTENDANCE_QR_SETUP",
      "Administración debe completar la activación del fichaje con QR.",
      503,
    );
}
async function personalSession(tx: AppDb | Tx, actor: Actor, now: Date) {
  if (!actor.sessionId || (await getStoreProfile(tx, actor.id)))
    throw new AppError(
      "ATTENDANCE_PERSONAL_ACCOUNT",
      "Ingresá con tu cuenta personal para fichar.",
      403,
    );
  const [row] = await tx
    .select({ id: session.id })
    .from(session)
    .where(
      and(
        eq(session.id, actor.sessionId),
        eq(session.userId, actor.id),
        gt(session.expiresAt, now),
      ),
    )
    .for("share");
  if (!row)
    throw new AppError(
      "UNAUTHORIZED",
      "Tu sesión venció. Volvé a ingresar para fichar.",
      401,
    );
}
export async function openAttendanceQrAttempt(
  db: AppDb,
  actor: Actor,
  raw: unknown,
  now = new Date(),
) {
  const input = z
    .object({ code: z.string().max(180), requestId: z.uuid() })
    .strict()
    .parse(raw);
  const decoded = readAttendanceQr(
    input.code,
    process.env.BETTER_AUTH_SECRET ?? "",
    now,
  );
  if (actor.branchId !== decoded.branchId)
    throw new AppError(
      "ATTENDANCE_QR_BRANCH",
      "El código corresponde a otra sucursal. Volvé a escanearlo.",
      409,
    );
  await requireQrAccessReady(db);
  return db.transaction(async (tx) => {
    const ctx = await requireOperationalContext(tx, actor, decoded.branchId);
    const policy = await getAttendancePolicy(tx, ctx.branchId);
    if (!policy.enabled || policy.revision !== decoded.revision)
      throw new AppError(
        "ATTENDANCE_QR_EXPIRED",
        "El código venció o cambió la configuración. Escaneá el QR actual del local.",
        409,
      );
    await lockIdentity(tx, actor.id);
    await personalSession(tx, actor, now);
    await requireParticipant(tx, ctx.branchId, actor.id);
    const fingerprint = canonicalHash({
      code: input.code,
      userId: actor.id,
      sessionId: actor.sessionId,
    });
    const [previous] = await tx
      .select()
      .from(attendanceQrAttempts)
      .where(eq(attendanceQrAttempts.requestId, input.requestId));
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new AppError(
          "IDEMPOTENCY_CONFLICT",
          "La clave corresponde a otro intento de fichaje.",
          409,
        );
      if (previous.consumedAt || previous.expiresAt <= now)
        throw new AppError(
          "ATTENDANCE_QR_EXPIRED",
          "El intento venció o ya se usó. Escaneá un nuevo QR.",
          409,
        );
      return {
        id: previous.id,
        branchId: previous.branchId,
        expiresAt: previous.expiresAt.toISOString(),
        serverNow: now.toISOString(),
      };
    }
    const [count] = await tx
      .select({ total: sql<number>`count(*)::int` })
      .from(attendanceQrAttempts)
      .where(
        and(
          eq(attendanceQrAttempts.userId, actor.id),
          gte(attendanceQrAttempts.createdAt, new Date(+now - 60000)),
        ),
      );
    if (count.total >= 30)
      throw new AppError(
        "ATTENDANCE_QR_RATE_LIMIT",
        "Hay demasiados intentos. Esperá un minuto y volvé a escanear.",
        429,
      );
    const id = crypto.randomUUID(),
      expiresAt = new Date(+now + 120000);
    await tx
      .insert(attendanceQrAttempts)
      .values({
        id,
        requestId: input.requestId,
        userId: actor.id,
        sessionId: actor.sessionId!,
        branchId: ctx.branchId,
        settingsRevision: policy.revision,
        fingerprint,
        createdAt: now,
        expiresAt,
      });
    return {
      id,
      branchId: ctx.branchId,
      expiresAt: expiresAt.toISOString(),
      serverNow: now.toISOString(),
    };
  });
}
/** Call only in the punch transaction, after successful-operation replay lookup. */
export async function consumeAttendanceQrAttempt(
  tx: Tx,
  actor: Actor,
  attemptId: string | undefined,
  requestId: string,
  revision: number,
  now = new Date(),
) {
  await requireQrAccessReady(tx);
  await personalSession(tx, actor, now);
  if (!attemptId)
    throw new AppError(
      "ATTENDANCE_QR_REQUIRED",
      "Escaneá el QR actual del local antes de fichar.",
      409,
    );
  const [attempt] = await tx
    .select()
    .from(attendanceQrAttempts)
    .where(eq(attendanceQrAttempts.id, attemptId))
    .for("update");
  if (
    !attempt ||
    attempt.userId !== actor.id ||
    attempt.sessionId !== actor.sessionId ||
    attempt.branchId !== actor.branchId ||
    attempt.settingsRevision !== revision
  )
    throw new AppError(
      "ATTENDANCE_QR_INVALID",
      "El intento no corresponde a esta cuenta, sesión o sucursal. Volvé a escanear.",
      403,
    );
  if (attempt.expiresAt <= now)
    throw new AppError(
      "ATTENDANCE_QR_EXPIRED",
      "El intento venció. Escaneá el QR actual del local.",
      409,
    );
  if (attempt.consumedAt)
    throw new AppError(
      "ATTENDANCE_QR_USED",
      "El intento ya se utilizó. Escaneá un nuevo QR para esta marca.",
      409,
    );
  await requireParticipant(tx, attempt.branchId, actor.id);
  await tx
    .update(attendanceQrAttempts)
    .set({ consumedAt: now, operationRequestId: requestId })
    .where(eq(attendanceQrAttempts.id, attempt.id));
  return { id: attempt.id, createdAt: attempt.createdAt.toISOString() };
}
