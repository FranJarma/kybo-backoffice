import { createHash, randomUUID } from "node:crypto";
import { and, eq, isNull, gte, sql } from "drizzle-orm";
import { z } from "zod";
import { verifyPassword } from "better-auth/crypto";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  type RegistrationResponseJSON,
  type AuthenticationResponseJSON,
  type AuthenticatorTransport,
} from "@simplewebauthn/server";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import { user, account } from "@/db/auth-schema";
import { auditEvents } from "@/db/business-schema";
import {
  identityCredentials,
  identityChallenges,
  identityConfirmations,
  identityEnrollmentLimits,
} from "@/db/identity-schema";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import {
  requireOperationalContext,
  requireAdministrator,
} from "@/modules/branches/context";
import { canonicalHash } from "./crypto";
import type { ConfirmationBinding, IdentityConfig } from "./types";
import { requireBranchEmployee } from "@/modules/attendance/access";
import { getStoreProfile } from "@/modules/workplace/access";
import { requireEnrollmentGrant } from "@/modules/invitations/authentication";
import { identityEnrollmentGrants } from "@/db/invitations-schema";

const enrollmentSchema = z
  .object({
    password: z.string().min(1).max(128),
    name: z.string().trim().min(1).max(60),
  })
  .strict();
const bindingSchema = z
  .object({
    action: z.enum(["attendance-punch", "production-start", "cash-close"]),
    branchId: z.uuid(),
    requestId: z.uuid(),
    payload: z.json(),
  })
  .strict();
const failedVerification = () =>
  new AppError(
    "IDENTITY_VERIFICATION",
    "No pudimos verificar tu celular. No se realizó la operación; volvé a intentarlo.",
    401,
  );
export async function lockIdentity(tx: Tx, userId: string) {
  const [row] = await tx
    .select({ id: user.id })
    .from(user)
    .where(eq(user.id, userId))
    .for("update");
  if (!row)
    throw new AppError("FORBIDDEN", "La cuenta ya no está disponible.", 403);
}
async function liveContext(tx: Tx, actor: Actor) {
  if (actor.accountKind === "store" || (await getStoreProfile(tx, actor.id)))
    throw new AppError(
      "FORBIDDEN",
      "La verificación del celular requiere una cuenta personal.",
      403,
    );
  await requireOperationalContext(tx, actor, actor.branchId ?? "");
  await lockIdentity(tx, actor.id);
  return requireOperationalContext(tx, actor, actor.branchId ?? "");
}
async function challengeThrottle(tx: Tx, userId: string, now: Date) {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(identityChallenges)
    .where(
      and(
        eq(identityChallenges.userId, userId),
        gte(identityChallenges.createdAt, new Date(now.getTime() - 60000)),
      ),
    );
  if (row.count >= 30)
    throw new AppError(
      "IDENTITY_RATE_LIMIT",
      "Hay demasiados intentos. Esperá un minuto antes de volver a intentar.",
      429,
    );
}
export async function listCredentials(
  db: AppDb,
  actor: Actor,
  config: IdentityConfig,
  targetId = actor.id,
) {
  return db.transaction(async (tx) => {
    await requireOperationalContext(tx, actor, actor.branchId ?? "");
    if (targetId !== actor.id) {
      await requireAdministrator(tx, actor);
      await requireBranchEmployee(tx, actor.branchId!, targetId);
    }
    return tx
      .select({
        id: identityCredentials.id,
        name: identityCredentials.name,
        createdAt: identityCredentials.createdAt,
        lastUsedAt: identityCredentials.lastUsedAt,
      })
      .from(identityCredentials)
      .where(
        and(
          eq(identityCredentials.userId, targetId),
          eq(identityCredentials.rpId, config.rpId),
          isNull(identityCredentials.revokedAt),
        ),
      );
  });
}
export async function beginRegistration(
  db: AppDb,
  actor: Actor,
  raw: unknown,
  config: IdentityConfig,
  now = new Date(),
) {
  const input = enrollmentSchema.parse(raw);
  return createRegistration(db, actor, input, config, now, false);
}
export async function beginGuidedRegistration(
  db: AppDb,
  actor: Actor,
  config: IdentityConfig,
  now = new Date(),
) {
  return createRegistration(
    db,
    actor,
    { password: "", name: "Mi celular" },
    config,
    now,
    true,
  );
}
async function createRegistration(
  db: AppDb,
  actor: Actor,
  input: { password: string; name: string },
  config: IdentityConfig,
  now: Date,
  guided: boolean,
) {
  const result = await db.transaction(async (tx) => {
    const ctx = await liveContext(tx, actor);
    if (guided) await requireEnrollmentGrant(tx, actor, now);
    const [previous] = await tx
      .select()
      .from(identityEnrollmentLimits)
      .where(eq(identityEnrollmentLimits.userId, actor.id))
      .for("update");
    if (previous?.blockedUntil && previous.blockedUntil > now)
      return {
        ok: false as const,
        error: new AppError(
          "IDENTITY_RATE_LIMIT",
          "Esperá 15 minutos antes de volver a registrar una credencial.",
          429,
        ),
      };
    const [credential] = await tx
      .select({ password: account.password })
      .from(account)
      .where(
        and(eq(account.userId, actor.id), eq(account.providerId, "credential")),
      )
      .limit(1);
    const correct =
      guided ||
      (credential?.password
        ? await verifyPassword({
            hash: credential.password,
            password: input.password,
          })
        : false);
    if (!correct) {
      const failures =
        previous && now.getTime() - previous.windowAt.getTime() < 900000
          ? previous.failures + 1
          : 1;
      const windowAt = previous && failures > 1 ? previous.windowAt : now;
      await tx
        .insert(identityEnrollmentLimits)
        .values({
          userId: actor.id,
          failures,
          windowAt,
          blockedUntil: failures >= 5 ? new Date(now.getTime() + 900000) : null,
        })
        .onConflictDoUpdate({
          target: identityEnrollmentLimits.userId,
          set: {
            failures,
            windowAt,
            blockedUntil:
              failures >= 5 ? new Date(now.getTime() + 900000) : null,
          },
        });
      return {
        ok: false as const,
        error: new AppError(
          "IDENTITY_PASSWORD",
          "La contraseña no coincide. No se registró ninguna credencial.",
          401,
        ),
      };
    }
    await tx
      .delete(identityEnrollmentLimits)
      .where(eq(identityEnrollmentLimits.userId, actor.id));
    await challengeThrottle(tx, actor.id, now);
    const [profile] = await tx.select().from(user).where(eq(user.id, actor.id));
    const existing = await tx
      .select()
      .from(identityCredentials)
      .where(
        and(
          eq(identityCredentials.userId, actor.id),
          eq(identityCredentials.rpId, config.rpId),
          isNull(identityCredentials.revokedAt),
        ),
      );
    if (guided && existing.length)
      throw new AppError(
        "IDENTITY_ALREADY_CONFIGURED",
        "La verificación del celular ya está configurada.",
        409,
      );
    const options = await generateRegistrationOptions({
      rpName: "Kybo Operations",
      rpID: config.rpId,
      userID: new Uint8Array(
        createHash("sha256")
          .update("kybo-user:" + actor.id)
          .digest(),
      ),
      userName: profile.username || profile.name,
      userDisplayName: profile.name,
      attestationType: "none",
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        residentKey: "required",
        userVerification: "required",
      },
      excludeCredentials: existing.map((c) => ({
        id: c.id,
        transports: c.transports as AuthenticatorTransport[],
      })),
      timeout: 60000,
    });
    const id = randomUUID();
    await tx.insert(identityChallenges).values({
      id,
      userId: actor.id,
      branchId: ctx.branchId,
      kind: "registration",
      challenge: options.challenge,
      origin: config.origin,
      rpId: config.rpId,
      binding: {
        name: input.name,
        ...(guided ? { enrollmentSessionId: actor.sessionId } : {}),
      },
      createdAt: now,
      expiresAt: new Date(now.getTime() + 300000),
    });
    return { ok: true as const, challengeId: id, options };
  });
  if (!result.ok) throw result.error;
  return { challengeId: result.challengeId, options: result.options };
}
async function getChallenge(
  tx: Tx,
  actor: Actor,
  id: string,
  kind: "registration" | "verification",
  config: IdentityConfig,
  now: Date,
) {
  z.uuid().parse(id);
  const [row] = await tx
    .select()
    .from(identityChallenges)
    .where(eq(identityChallenges.id, id))
    .for("update");
  if (
    !row ||
    row.userId !== actor.id ||
    row.branchId !== actor.branchId ||
    row.kind !== kind ||
    row.origin !== config.origin ||
    row.rpId !== config.rpId ||
    row.consumedAt ||
    row.expiresAt <= now
  )
    throw failedVerification();
  return row;
}
export async function finishRegistration(
  db: AppDb,
  actor: Actor,
  input: { challengeId: string; response: RegistrationResponseJSON },
  config: IdentityConfig,
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    await liveContext(tx, actor);
    const challenge = await getChallenge(
      tx,
      actor,
      input.challengeId,
      "registration",
      config,
      now,
    );
    if (challenge.binding.enrollmentSessionId) {
      if (challenge.binding.enrollmentSessionId !== actor.sessionId)
        throw failedVerification();
      await requireEnrollmentGrant(tx, actor, now);
    }
    let result;
    try {
      result = await verifyRegistrationResponse({
        response: input.response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: challenge.origin,
        expectedRPID: challenge.rpId,
        requireUserVerification: true,
        requireUserPresence: true,
      });
    } catch {
      throw failedVerification();
    }
    if (!result.verified || !result.registrationInfo.userVerified)
      throw failedVerification();
    const info = result.registrationInfo;
    await tx.insert(identityCredentials).values({
      id: info.credential.id,
      userId: actor.id,
      rpId: config.rpId,
      publicKey: Buffer.from(info.credential.publicKey).toString("base64url"),
      counter: info.credential.counter,
      transports: info.credential.transports ?? [],
      deviceType: info.credentialDeviceType,
      backedUp: info.credentialBackedUp,
      name: String(challenge.binding.name),
      createdAt: now,
    });
    await tx
      .update(identityChallenges)
      .set({ consumedAt: now })
      .where(eq(identityChallenges.id, challenge.id));
    if (challenge.binding.enrollmentSessionId)
      await tx
        .update(identityEnrollmentGrants)
        .set({ consumedAt: now })
        .where(eq(identityEnrollmentGrants.sessionId, actor.sessionId!));
    await tx.insert(auditEvents).values({
      actorId: actor.id,
      entity: "identity_credential",
      recordId: challenge.id,
      action: "registered",
      after: {
        credentialId: info.credential.id,
        branchId: actor.branchId,
        name: challenge.binding.name,
      },
      createdAt: now,
    });
    return { id: info.credential.id };
  });
}
export async function beginVerification(
  db: AppDb,
  actor: Actor,
  raw: ConfirmationBinding,
  config: IdentityConfig,
  now = new Date(),
) {
  const binding = bindingSchema.parse(raw);
  return db.transaction(async (tx) => {
    const ctx = await liveContext(tx, actor);
    if (binding.branchId !== ctx.branchId) throw failedVerification();
    await challengeThrottle(tx, actor.id, now);
    const credentials = await tx
      .select()
      .from(identityCredentials)
      .where(
        and(
          eq(identityCredentials.userId, actor.id),
          eq(identityCredentials.rpId, config.rpId),
          isNull(identityCredentials.revokedAt),
        ),
      );
    if (!credentials.length)
      throw new AppError(
        "IDENTITY_ENROLLMENT_REQUIRED",
        "Primero configurá la verificación de tu celular con tu cuenta de Kybo.",
        409,
      );
    const options = await generateAuthenticationOptions({
      rpID: config.rpId,
      userVerification: "required",
      timeout: 60000,
      allowCredentials: credentials.map((c) => ({
        id: c.id,
        transports: c.transports as AuthenticatorTransport[],
      })),
    });
    const id = randomUUID();
    await tx.insert(identityChallenges).values({
      id,
      userId: actor.id,
      branchId: ctx.branchId,
      kind: "verification",
      challenge: options.challenge,
      origin: config.origin,
      rpId: config.rpId,
      binding: {
        action: binding.action,
        requestId: binding.requestId,
        payloadHash: canonicalHash(binding.payload),
      },
      createdAt: now,
      expiresAt: new Date(now.getTime() + 300000),
    });
    return { challengeId: id, options };
  });
}
export async function finishVerification(
  db: AppDb,
  actor: Actor,
  input: { challengeId: string; response: AuthenticationResponseJSON },
  config: IdentityConfig,
  now = new Date(),
) {
  return db.transaction(async (tx) => {
    await liveContext(tx, actor);
    const challenge = await getChallenge(
      tx,
      actor,
      input.challengeId,
      "verification",
      config,
      now,
    );
    const [credential] = await tx
      .select()
      .from(identityCredentials)
      .where(eq(identityCredentials.id, input.response.id))
      .for("update");
    if (
      !credential ||
      credential.userId !== actor.id ||
      credential.rpId !== config.rpId ||
      credential.revokedAt
    )
      throw failedVerification();
    let result;
    try {
      result = await verifyAuthenticationResponse({
        response: input.response,
        expectedChallenge: challenge.challenge,
        expectedOrigin: challenge.origin,
        expectedRPID: challenge.rpId,
        requireUserVerification: true,
        credential: {
          id: credential.id,
          publicKey: new Uint8Array(
            Buffer.from(credential.publicKey, "base64url"),
          ),
          counter: credential.counter,
          transports: credential.transports as AuthenticatorTransport[],
        },
      });
    } catch {
      throw failedVerification();
    }
    if (!result.verified || !result.authenticationInfo.userVerified)
      throw failedVerification();
    await tx
      .update(identityCredentials)
      .set({
        counter: result.authenticationInfo.newCounter,
        backedUp: result.authenticationInfo.credentialBackedUp,
        lastUsedAt: now,
      })
      .where(eq(identityCredentials.id, credential.id));
    await tx
      .update(identityChallenges)
      .set({ consumedAt: now })
      .where(eq(identityChallenges.id, challenge.id));
    const proofId = randomUUID(),
      expiresAt = new Date(now.getTime() + 120000);
    await tx.insert(identityConfirmations).values({
      id: proofId,
      userId: actor.id,
      branchId: actor.branchId!,
      credentialId: credential.id,
      action: String(challenge.binding.action),
      requestId: String(challenge.binding.requestId),
      payloadHash: String(challenge.binding.payloadHash),
      verifiedAt: now,
      expiresAt,
    });
    return { proofId, expiresAt: expiresAt.toISOString() };
  });
}
export async function consumeConfirmation(
  tx: Tx,
  actor: Actor,
  binding: ConfirmationBinding,
  proofId: string | undefined,
  now = new Date(),
) {
  if (!proofId || !z.uuid().safeParse(proofId).success)
    throw new AppError(
      "IDENTITY_REQUIRED",
      "Confirmá esta operación con Face ID, huella o el método de tu celular.",
      409,
    );
  await requireOperationalContext(tx, actor, binding.branchId);
  const [proof] = await tx
    .select()
    .from(identityConfirmations)
    .where(eq(identityConfirmations.id, proofId))
    .for("update");
  if (
    !proof ||
    proof.userId !== actor.id ||
    proof.branchId !== binding.branchId ||
    proof.action !== binding.action ||
    proof.requestId !== binding.requestId ||
    proof.payloadHash !== canonicalHash(binding.payload) ||
    proof.consumedAt ||
    proof.expiresAt <= now
  )
    throw failedVerification();
  const [credential] = await tx
    .select()
    .from(identityCredentials)
    .where(eq(identityCredentials.id, proof.credentialId))
    .for("share");
  if (!credential || credential.userId !== actor.id || credential.revokedAt)
    throw failedVerification();
  await tx
    .update(identityConfirmations)
    .set({ consumedAt: now, operationId: binding.requestId })
    .where(eq(identityConfirmations.id, proof.id));
  return {
    credentialId: proof.credentialId,
    proofId: proof.id,
    verifiedAt: proof.verifiedAt.toISOString(),
  };
}
export async function revokeCredential(
  db: AppDb,
  actor: Actor,
  credentialId: string,
  now = new Date(),
) {
  await db.transaction(async (tx) => {
    await requireOperationalContext(tx, actor, actor.branchId ?? "");
    const [credential] = await tx
      .select()
      .from(identityCredentials)
      .where(eq(identityCredentials.id, credentialId));
    if (!credential)
      throw new AppError("NOT_FOUND", "La credencial no está disponible.", 404);
    if (credential.userId !== actor.id) await requireAdministrator(tx, actor);
    await lockIdentity(tx, credential.userId);
    if (credential.userId !== actor.id) await requireAdministrator(tx, actor);
    await tx
      .update(identityCredentials)
      .set({ revokedAt: now, revokedBy: actor.id })
      .where(eq(identityCredentials.id, credentialId));
    await tx.insert(auditEvents).values({
      actorId: actor.id,
      entity: "identity_credential",
      recordId: randomUUID(),
      action: "revoked",
      after: { credentialId, userId: credential.userId },
      createdAt: now,
    });
  });
}
