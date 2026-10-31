import { createHash, randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, eq, ne, gt, sql, inArray } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { account, operationalUsers, session, user } from "@/db/auth-schema";
import { userPasswordPolicies as policies } from "@/db/password-policy-schema";
import { auditEvents } from "@/db/business-schema";
import { workplaceStoreAccounts } from "@/db/workplace-schema";
import type { PasswordPolicyState } from "./types";
import { ownPasswordInput } from "./validation";
export { ownPasswordInput } from "./validation";

type Row = typeof policies.$inferSelect;
type Db = AppDb | Tx;
const credentialVersion = (hash: string) =>
  createHash("sha256").update(hash).digest("hex");
const expired = () =>
  new AppError(
    "TEMPORARY_PASSWORD_EXPIRED",
    "La contraseña temporal venció. Pedí a Administración una nueva contraseña para volver a ingresar.",
    403,
  );
const denied = () =>
  new AppError(
    "UNAUTHORIZED",
    "Volvé a iniciar sesión para cambiar tu contraseña.",
    401,
  );
export function assertPasswordDeadline(
  required: boolean,
  expiresAt: Date | null | undefined,
  now = new Date(),
) {
  if (required && expiresAt && expiresAt <= now) throw expired();
}
const state = (
  row: Row | undefined,
  now: Date,
  ready = true,
): PasswordPolicyState => ({
  ready,
  required: row?.required === true,
  firstLoginAt: row?.firstLoginAt?.toISOString() ?? null,
  expiresAt: row?.expiresAt?.toISOString() ?? null,
  blocked: row?.required === true && !!row.expiresAt && row.expiresAt <= now,
});
export async function passwordPolicySchemaReady(db: Db) {
  const result = await db.execute(
    sql`select to_regclass('public.user_password_policies') is not null as ready`,
  );
  return result.rows[0]?.ready === true;
}
async function isStoreAccount(db: Db, userId: string) {
  const available = await db.execute(
    sql`select to_regclass('public.workplace_store_accounts') is not null as ready`,
  );
  if (available.rows[0]?.ready !== true) return false;
  return (
    (
      await db
        .select({ id: workplaceStoreAccounts.userId })
        .from(workplaceStoreAccounts)
        .where(eq(workplaceStoreAccounts.userId, userId))
    ).length > 0
  );
}
export async function passwordPolicyState(
  db: Db,
  userId: string,
  now = new Date(),
) {
  if (!(await passwordPolicySchemaReady(db)))
    return state(undefined, now, false);
  const [row] = await db
    .select()
    .from(policies)
    .where(eq(policies.userId, userId));
  return state(row, now);
}
export async function requirePasswordAccess(
  db: Db,
  userId: string,
  now = new Date(),
): Promise<void> {
  if ((await passwordPolicyState(db, userId, now)).blocked) throw expired();
}
export async function passwordPolicyStates(
  db: Db,
  userIds: string[],
  now = new Date(),
) {
  const result = new Map<string, PasswordPolicyState>();
  if (!userIds.length || !(await passwordPolicySchemaReady(db))) return result;
  const rows = await db
    .select()
    .from(policies)
    .where(inArray(policies.userId, userIds));
  for (const id of userIds)
    result.set(
      id,
      state(
        rows.find((row) => row.userId === id),
        now,
      ),
    );
  return result;
}
/** Internal permanent issuance after an authorized admin supplied a replacement. */
export async function clearTemporaryPassword(
  tx: Tx,
  userId: string,
  now = new Date(),
) {
  if (!(await passwordPolicySchemaReady(tx))) return;
  const [credential] = await tx
    .select({ password: account.password })
    .from(account)
    .where(
      and(eq(account.userId, userId), eq(account.providerId, "credential")),
    );
  if (!credential?.password) throw denied();
  await tx
    .update(policies)
    .set({
      required: false,
      completedAt: now,
      credentialVersion: credentialVersion(credential.password),
      updatedAt: now,
      failures: 0,
      failureWindowAt: null,
      blockedUntil: null,
    })
    .where(eq(policies.userId, userId));
}

/** Internal issuance: caller must already hold live account-administration locks. */
export async function issueTemporaryPassword(
  tx: Tx,
  userId: string,
  actorId: string,
  now = new Date(),
): Promise<void> {
  if (!(await passwordPolicySchemaReady(tx)))
    throw new AppError(
      "PASSWORD_POLICY_SETUP",
      "Administración debe completar la activación de contraseñas temporales antes de emitirlas.",
      503,
    );
  if (await isStoreAccount(tx, userId))
    throw new AppError(
      "FORBIDDEN",
      "La cuenta del local utiliza una credencial administrada por el propietario.",
      403,
    );
  const [credential] = await tx
    .select()
    .from(account)
    .where(
      and(eq(account.userId, userId), eq(account.providerId, "credential")),
    )
    .for("update");
  if (!credential?.password) throw denied();
  const values = {
    required: true,
    generation: randomUUID(),
    credentialVersion: credentialVersion(credential.password),
    issuedBy: actorId,
    issuedAt: now,
    firstLoginAt: null,
    expiresAt: null,
    completedAt: null,
    failures: 0,
    failureWindowAt: null,
    blockedUntil: null,
    updatedAt: now,
  };
  await tx
    .insert(policies)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: policies.userId, set: values });
}

/** Password was just checked under the account locks by login finalization. */
export async function beginTemporaryPasswordLogin(
  tx: Tx,
  userId: string,
  now = new Date(),
  knownReady = false,
) {
  // Reuse positive availability only, so a newly installed schema is still
  // detected if the caller's earlier check found it absent.
  if (!knownReady && !(await passwordPolicySchemaReady(tx)))
    return state(undefined, now, false);
  const [row] = await tx
    .select()
    .from(policies)
    .where(eq(policies.userId, userId))
    .for("update");
  if (!row?.required) return state(row, now);
  if (state(row, now).blocked) throw expired();
  const [credential] = await tx
    .select({ password: account.password })
    .from(account)
    .where(
      and(eq(account.userId, userId), eq(account.providerId, "credential")),
    );
  if (
    !credential?.password ||
    credentialVersion(credential.password) !== row.credentialVersion
  )
    throw new AppError(
      "PASSWORD_POLICY_STALE",
      "La contraseña cambió. Pedí a Administración una nueva contraseña temporal.",
      403,
    );
  if (row.firstLoginAt) return state(row, now);
  const [updated] = await tx
    .update(policies)
    .set({
      firstLoginAt: now,
      expiresAt: new Date(+now + 86400000),
      updatedAt: now,
    })
    .where(eq(policies.userId, userId))
    .returning();
  return state(updated, now);
}

export async function changeOwnPassword(
  db: AppDb,
  actor: Actor,
  raw: unknown,
  now = new Date(),
): Promise<void> {
  const input = ownPasswordInput.parse(raw);
  if (!actor.sessionId) throw denied();
  if (!(await passwordPolicySchemaReady(db)))
    throw new AppError(
      "PASSWORD_POLICY_SETUP",
      "El cambio de contraseña todavía no está habilitado.",
      503,
    );
  const result = await db.transaction(async (tx) => {
    const [access] = await tx
      .select()
      .from(operationalUsers)
      .where(eq(operationalUsers.userId, actor.id))
      .for("update");
    await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, actor.id))
      .for("update");
    const [live] = await tx
      .select()
      .from(session)
      .where(
        and(
          eq(session.id, actor.sessionId!),
          eq(session.userId, actor.id),
          gt(session.expiresAt, now),
        ),
      )
      .for("update");
    if (
      !access ||
      access.disabled ||
      !live ||
      actor.accountKind === "store" ||
      (await isStoreAccount(tx, actor.id))
    )
      throw denied();
    const [credential] = await tx
      .select()
      .from(account)
      .where(
        and(eq(account.userId, actor.id), eq(account.providerId, "credential")),
      )
      .for("update");
    if (!credential?.password) throw denied();
    await tx
      .insert(policies)
      .values({
        userId: actor.id,
        issuedBy: actor.id,
        credentialVersion: credentialVersion(credential.password),
        issuedAt: now,
        updatedAt: now,
      })
      .onConflictDoNothing();
    const [row] = await tx
      .select()
      .from(policies)
      .where(eq(policies.userId, actor.id))
      .for("update");
    if (state(row, now).blocked) throw expired();
    if (row.blockedUntil && row.blockedUntil > now)
      throw new AppError(
        "PASSWORD_RATE_LIMIT",
        "Esperá 15 minutos antes de volver a intentar el cambio.",
        429,
      );
    if (
      !(await verifyPassword({
        hash: credential.password,
        password: input.currentPassword,
      }))
    ) {
      const failures =
        row.failureWindowAt && +now - +row.failureWindowAt < 900000
          ? row.failures + 1
          : 1;
      await tx
        .update(policies)
        .set({
          failures,
          failureWindowAt: failures === 1 ? now : row.failureWindowAt,
          blockedUntil: failures >= 5 ? new Date(+now + 900000) : null,
          updatedAt: now,
        })
        .where(eq(policies.userId, actor.id));
      return {
        error: new AppError(
          "PASSWORD_INVALID",
          "La contraseña actual no es correcta.",
          401,
        ),
      };
    }
    if (
      await verifyPassword({
        hash: credential.password,
        password: input.newPassword,
      })
    )
      return {
        error: new AppError(
          "PASSWORD_REUSED",
          "Elegí una contraseña diferente de la actual.",
          400,
        ),
      };
    const hash = await hashPassword(input.newPassword);
    await tx
      .update(account)
      .set({ password: hash, updatedAt: now })
      .where(eq(account.id, credential.id));
    await tx
      .update(policies)
      .set({
        required: false,
        completedAt: now,
        credentialVersion: credentialVersion(hash),
        failures: 0,
        failureWindowAt: null,
        blockedUntil: null,
        updatedAt: now,
      })
      .where(eq(policies.userId, actor.id));
    await tx
      .delete(session)
      .where(
        and(eq(session.userId, actor.id), ne(session.id, actor.sessionId!)),
      );
    await tx.insert(auditEvents).values({
      actorId: actor.id,
      entity: "password-change",
      recordId: randomUUID(),
      action: "change",
      after: {
        userId: actor.id,
        passwordChanged: true,
        temporaryResolved: row.required,
        otherSessionsRevoked: true,
      },
      createdAt: now,
    });
    return { ok: true };
  });
  if ("error" in result) throw result.error;
}
