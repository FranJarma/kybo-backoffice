import { and, eq, isNull, gt } from "drizzle-orm";
import { verifyPassword } from "better-auth/crypto";
import { account, operationalUsers, session, user } from "@/db/auth-schema";
import { branchMemberships, branches } from "@/db/branch-schema";
import { identityCredentials } from "@/db/identity-schema";
import {
  identityEnrollmentGrants,
  userInvitations,
} from "@/db/invitations-schema";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { getStoreProfile } from "@/modules/workplace/access";
import { invitationsSchemaReady } from "./availability";
import { invitationHash } from "./crypto";
import { cleanupExpiredInvitationMessages } from "./queries";
import type { OnboardingState } from "./types";
const denied = () =>
  new AppError(
    "INVITATION_INVALID",
    "La invitación no está vigente o la cuenta no está habilitada. Pedí una nueva invitación a Administración.",
    403,
  );
const skipped: OnboardingState = {
  needed: false,
  enrollmentReady: false,
  branchId: null,
};
/** Called only after Better Auth has verified the password; it rechecks under the same locks as renewal. */
export async function finalizePasswordLogin(
  db: AppDb,
  input: {
    sessionToken: string;
    password: string;
    invitationToken: string | null;
    secret: string;
    rpId: string;
  },
  now = new Date(),
): Promise<OnboardingState> {
  if (!(await invitationsSchemaReady(db))) return skipped;
  // Cleanup survives a subsequently rejected login transaction.
  await cleanupExpiredInvitationMessages(db, now);
  return db.transaction(async (tx) => {
    const [authenticated] = await tx
      .select()
      .from(session)
      .where(
        and(eq(session.token, input.sessionToken), gt(session.expiresAt, now)),
      );
    if (!authenticated) throw denied();
    const [access] = await tx
      .select()
      .from(operationalUsers)
      .where(eq(operationalUsers.userId, authenticated.userId))
      .for("update");
    await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, authenticated.userId))
      .for("update");
    const [credential] = await tx
      .select()
      .from(account)
      .where(
        and(
          eq(account.userId, authenticated.userId),
          eq(account.providerId, "credential"),
        ),
      );
    if (
      !access ||
      access.disabled ||
      !credential?.password ||
      !(await verifyPassword({
        hash: credential.password,
        password: input.password,
      }))
    )
      throw denied();
    const store = await getStoreProfile(tx, authenticated.userId);
    if (store) {
      if (!store.enabled || access.role !== "staff" || access.catalogManager)
        throw denied();
      return skipped;
    }
    const [invitation] = await tx
      .select()
      .from(userInvitations)
      .where(eq(userInvitations.userId, authenticated.userId))
      .for("update");
    if (invitation && !invitation.activatedAt) {
      if (
        invitation.expiresAt <= now ||
        !input.invitationToken ||
        invitation.tokenHash !==
          invitationHash(input.invitationToken, input.secret)
      )
        throw denied();
      const [membership] = await tx
        .select()
        .from(branchMemberships)
        .where(
          and(
            eq(branchMemberships.userId, authenticated.userId),
            eq(branchMemberships.branchId, invitation.branchId),
            isNull(branchMemberships.revokedAt),
          ),
        );
      const [branch] = await tx
        .select()
        .from(branches)
        .where(
          and(
            eq(branches.id, invitation.branchId),
            isNull(branches.archivedAt),
          ),
        );
      if (!membership || !branch) throw denied();
      await tx
        .update(userInvitations)
        .set({ activatedAt: now, messageCiphertext: null, updatedAt: now })
        .where(eq(userInvitations.userId, authenticated.userId));
    }
    if (!invitation) return skipped;
    const [existing] = await tx
      .select({ id: identityCredentials.id })
      .from(identityCredentials)
      .where(
        and(
          eq(identityCredentials.userId, authenticated.userId),
          eq(identityCredentials.rpId, input.rpId),
          isNull(identityCredentials.revokedAt),
        ),
      )
      .limit(1);
    if (existing) return skipped;
    const [membership] = await tx
      .select({ branchId: branchMemberships.branchId })
      .from(branchMemberships)
      .innerJoin(
        branches,
        and(
          eq(branches.id, branchMemberships.branchId),
          isNull(branches.archivedAt),
        ),
      )
      .where(
        and(
          eq(branchMemberships.userId, authenticated.userId),
          eq(branchMemberships.branchId, invitation.branchId),
          isNull(branchMemberships.revokedAt),
        ),
      );
    if (!membership) return skipped;
    await tx
      .insert(identityEnrollmentGrants)
      .values({
        sessionId: authenticated.id,
        userId: authenticated.userId,
        branchId: membership.branchId,
        expiresAt: new Date(now.getTime() + 300000),
        createdAt: now,
      })
      .onConflictDoNothing();
    return {
      needed: true,
      enrollmentReady: true,
      branchId: membership.branchId,
    };
  });
}
export async function onboardingState(
  db: AppDb,
  actor: Actor,
  rpId: string,
  now = new Date(),
): Promise<OnboardingState> {
  if (
    !actor.sessionId ||
    actor.accountKind === "store" ||
    !(await invitationsSchemaReady(db))
  )
    return skipped;
  const [grant] = await db
    .select()
    .from(identityEnrollmentGrants)
    .where(
      and(
        eq(identityEnrollmentGrants.sessionId, actor.sessionId),
        eq(identityEnrollmentGrants.userId, actor.id),
        isNull(identityEnrollmentGrants.consumedAt),
        gt(identityEnrollmentGrants.expiresAt, now),
      ),
    );
  const [invitation] = await db
    .select()
    .from(userInvitations)
    .where(eq(userInvitations.userId, actor.id));
  const [existing] = await db
    .select({ id: identityCredentials.id })
    .from(identityCredentials)
    .where(
      and(
        eq(identityCredentials.userId, actor.id),
        eq(identityCredentials.rpId, rpId),
        isNull(identityCredentials.revokedAt),
      ),
    )
    .limit(1);
  return {
    needed: !!invitation && !existing,
    enrollmentReady: !!grant && !existing,
    branchId: grant?.branchId ?? invitation?.branchId ?? null,
  };
}
export async function requireEnrollmentGrant(tx: Tx, actor: Actor, now: Date) {
  if (
    !actor.sessionId ||
    actor.accountKind === "store" ||
    !(await invitationsSchemaReady(tx))
  )
    throw new AppError(
      "IDENTITY_LOGIN_REQUIRED",
      "Volvé a ingresar con tu contraseña para activar la verificación del celular.",
      401,
    );
  const [grant] = await tx
    .select()
    .from(identityEnrollmentGrants)
    .where(
      and(
        eq(identityEnrollmentGrants.sessionId, actor.sessionId),
        eq(identityEnrollmentGrants.userId, actor.id),
      ),
    )
    .for("update");
  const [liveSession] = await tx
    .select({ id: session.id })
    .from(session)
    .where(
      and(
        eq(session.id, actor.sessionId),
        eq(session.userId, actor.id),
        gt(session.expiresAt, now),
      ),
    );
  if (
    !grant ||
    !liveSession ||
    grant.branchId !== actor.branchId ||
    grant.consumedAt ||
    grant.expiresAt <= now
  )
    throw new AppError(
      "IDENTITY_LOGIN_REQUIRED",
      "Volvé a ingresar con tu contraseña para activar la verificación del celular.",
      401,
    );
  return grant;
}
