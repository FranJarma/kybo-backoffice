import { randomUUID } from "node:crypto";
import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, eq, gt, lt, sql } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import { account, operationalUsers, session, user } from "@/db/auth-schema";
import { auditEvents } from "@/db/business-schema";
import { workplaceStoreAccounts } from "@/db/workplace-schema";
import { userInvitations } from "@/db/invitations-schema";
import {
  passwordRecoveryChallenges as challenges,
  passwordRecoveryContacts as contacts,
  passwordRecoveryLimits as limits,
} from "@/db/password-recovery-schema";
import { clearTemporaryPassword } from "@/modules/password-policy/service";
import { AppError } from "@/lib/errors";
import { recoverySchemaReady } from "./contacts";
import {
  codeDigest,
  matchesDigest,
  randomCode,
  randomGrant,
  recoveryDigest,
  subjectVersion,
  emailContactVersion,
} from "./crypto";
import {
  recoveryRequestInput,
  recoveryVerifyInput,
  recoveryResetInput,
  isRecoveryEmail,
} from "./validation";
import { recoveryUnavailable } from "./provider";
import type { CodeSender, RecoveryContext } from "./types";

const invalid = () =>
  new AppError(
    "RECOVERY_INVALID",
    "El código o permiso no está vigente. Revisalo o solicitá uno nuevo.",
    400,
  );
const throttled = () =>
  new AppError(
    "RECOVERY_RATE_LIMIT",
    "Se realizaron muchos intentos. Esperá 15 minutos y volvé a probar.",
    429,
  );
type Subject = {
  userId: string;
  recipient: string;
  contactVersion: string;
  version: string;
  password: string;
  credentialId: string;
};
type Challenge = typeof challenges.$inferSelect;

// Same order as account administration and password changes. Even an unknown
// subject performs the same reads; no provider call is part of the response.
async function lockSubject(
  tx: Tx,
  userId: string,
  config: RecoveryContext,
): Promise<Subject | null> {
  const [access] = await tx
    .select()
    .from(operationalUsers)
    .where(eq(operationalUsers.userId, userId))
    .for("update");
  const [profile] = await tx
    .select()
    .from(user)
    .where(eq(user.id, userId))
    .for("update");
  const [credential] = await tx
    .select()
    .from(account)
    .where(
      and(eq(account.userId, userId), eq(account.providerId, "credential")),
    )
    .for("update");
  const [contact] = await tx
    .select()
    .from(contacts)
    .where(eq(contacts.userId, userId))
    .for("update");
  const [store] = await tx
    .select({ id: workplaceStoreAccounts.userId })
    .from(workplaceStoreAccounts)
    .where(eq(workplaceStoreAccounts.userId, userId));
  const [invitation] = await tx
    .select({ activatedAt: userInvitations.activatedAt })
    .from(userInvitations)
    .where(eq(userInvitations.userId, userId));
  if (
    !access ||
    access.disabled ||
    !profile ||
    !credential?.password ||
    store ||
    (invitation && !invitation.activatedAt)
  )
    return null;
  const email = profile.email.trim().toLowerCase();
  const byEmail = config.channel === "email";
  if (
    byEmail
      ? !profile.emailVerified || !isRecoveryEmail(email)
      : !contact?.enabled || !contact.phone || !contact.confirmedAt
  )
    return null;
  return {
    userId,
    recipient: byEmail ? email : contact!.phone!,
    contactVersion: byEmail
      ? emailContactVersion(config.secret, email)
      : contact!.version,
    password: credential.password,
    credentialId: credential.id,
    version: subjectVersion(
      credential.password,
      profile.updatedAt,
      access.updatedAt,
    ),
  };
}
const matchesSubject = (challenge: Challenge, subject: Subject | null) =>
  !!subject &&
  subject.userId === challenge.userId &&
  subject.contactVersion === challenge.contactVersion &&
  subject.version === challenge.subjectVersion;

async function takeLimit(
  tx: Tx,
  key: string,
  maximum: number,
  milliseconds: number,
  now: Date,
) {
  const [row] = await tx
    .insert(limits)
    .values({
      key,
      count: 1,
      windowAt: now,
      expiresAt: new Date(+now + milliseconds),
    })
    .onConflictDoUpdate({
      target: limits.key,
      set: {
        count: sql`case when ${limits.expiresAt}<=${now.toISOString()}::timestamptz then 1 else least(${limits.count}+1,${maximum + 1}) end`,
        windowAt: sql`case when ${limits.expiresAt}<=${now.toISOString()}::timestamptz then excluded.window_at else ${limits.windowAt} end`,
        expiresAt: sql`case when ${limits.expiresAt}<=${now.toISOString()}::timestamptz then excluded.expires_at else ${limits.expiresAt} end`,
      },
    })
    .returning({ count: limits.count });
  return row.count <= maximum;
}

export function createRecoveryService(
  db: AppDb,
  config: RecoveryContext,
  sender: CodeSender,
  clock = () => new Date(),
) {
  const key = (scope: string, value: string) =>
    recoveryDigest(config.secret, scope, value);
  const requireReady = async () => {
    if (!(await recoverySchemaReady(db))) throw recoveryUnavailable();
  };
  async function actionLimit(clientKey: string) {
    await requireReady();
    // Commit the limit even when the subsequent challenge is invalid.
    if (
      !(await db.transaction((tx) =>
        takeLimit(tx, key("action-client", clientKey), 30, 900000, clock()),
      ))
    )
      throw throttled();
  }
  async function withChallenge<T>(
    id: string,
    run: (tx: Tx, row: Challenge, subject: Subject) => Promise<T | null>,
  ) {
    return db.transaction(async (tx) => {
      const [hint] = await tx
        .select({ userId: challenges.userId })
        .from(challenges)
        .where(eq(challenges.id, id));
      const subject = await lockSubject(
        tx,
        hint?.userId ?? `absent-${id}`,
        config,
      );
      const [row] = await tx
        .select()
        .from(challenges)
        .where(eq(challenges.id, id))
        .for("update");
      if (!row || !subject || !matchesSubject(row, subject)) return null;
      return run(tx, row, subject);
    });
  }
  return {
    async request(rawIdentifier: string, clientKey: string) {
      const { identifier } = recoveryRequestInput.parse({
        action: "request",
        identifier: rawIdentifier,
      });
      await requireReady();
      const now = clock(),
        id = randomUUID(),
        code = randomCode();
      const result = await db.transaction(async (tx) => {
        await tx.delete(limits).where(lt(limits.expiresAt, now));
        await tx
          .delete(challenges)
          .where(lt(challenges.createdAt, new Date(+now - 86400000)));
        const global = await takeLimit(
          tx,
          key("global", "request"),
          100,
          60000,
          now,
        );
        const client = await takeLimit(
          tx,
          key("request-client", clientKey),
          10,
          900000,
          now,
        );
        const identifierAllowed = await takeLimit(
          tx,
          key("identifier", identifier),
          5,
          900000,
          now,
        );
        if (!global || !client) return { limited: true, subject: null };
        const [profile] = await tx
          .select({ id: user.id })
          .from(user)
          .where(
            identifier.includes("@")
              ? eq(user.email, identifier)
              : eq(user.username, identifier),
          );
        let subject = await lockSubject(
          tx,
          profile?.id ?? `absent-${id}`,
          config,
        );
        const [recent] = await tx
          .select({ id: challenges.id })
          .from(challenges)
          .where(
            and(
              eq(challenges.userId, subject?.userId ?? `absent-${id}`),
              gt(challenges.createdAt, new Date(+now - 60000)),
            ),
          )
          .limit(1);
        if (recent || !identifierAllowed) subject = null;
        const accountAllowed = await takeLimit(
          tx,
          key("account", subject?.userId ?? `absent-${id}`),
          3,
          900000,
          now,
        );
        if (!accountAllowed) subject = null;
        // New issuance invalidates earlier codes AND grants, under the subject lock.
        await tx
          .update(challenges)
          .set({ state: "invalid", grantDigest: null })
          .where(eq(challenges.userId, subject?.userId ?? `absent-${id}`));
        await tx.insert(challenges).values({
          id,
          userId: subject?.userId ?? null,
          contactVersion: subject?.contactVersion ?? null,
          subjectVersion: subject?.version ?? null,
          codeDigest: codeDigest(config.secret, id, code),
          state: "queued",
          createdAt: now,
          expiresAt: new Date(+now + 300000),
        });
        return { limited: false, subject };
      });
      if (result.limited) throw throttled();
      return {
        challengeId: id,
        expiresIn: 300,
        retryAfter: 60,
        message:
          config.channel === "email"
            ? "Si la cuenta tiene un correo de recuperación habilitado, recibirá un código. No compartas ese código."
            : "Si la cuenta tiene un WhatsApp de recuperación habilitado, recibirá un código. No compartas ese código.",
        // The code exists only in this short-lived closure, never in the database.
        deliver: async () => {
          if (!result.subject) return;
          const message = await withChallenge(id, async (tx, row, subject) => {
            if (row.state !== "queued" || row.expiresAt <= clock()) return null;
            await tx
              .update(challenges)
              .set({ state: "sending" })
              .where(eq(challenges.id, id));
            return { recipient: subject.recipient, code };
          });
          if (!message) return;
          try {
            await sender.sendCode(message);
            await withChallenge(id, async (tx, row) => {
              if (row.state !== "sending" || row.expiresAt <= clock())
                return null;
              await tx
                .update(challenges)
                .set({ state: "sent" })
                .where(eq(challenges.id, id));
              return true;
            });
          } catch {
            // Provider bodies/tokens/phone/code must not reach logs or the caller.
            await db
              .update(challenges)
              .set({ state: "failed", grantDigest: null })
              .where(
                and(eq(challenges.id, id), eq(challenges.state, "sending")),
              );
          }
        },
      };
    },
    async verify(challengeId: string, code: string, clientKey: string) {
      recoveryVerifyInput.parse({ action: "verify", challengeId, code });
      await actionLimit(clientKey);
      const grant = randomGrant();
      const result = await withChallenge(challengeId, async (tx, row) => {
        const now = clock();
        if (row.state !== "sent" || row.expiresAt <= now || row.attempts >= 5)
          return null;
        if (
          !matchesDigest(
            row.codeDigest,
            codeDigest(config.secret, challengeId, code),
          )
        ) {
          await tx
            .update(challenges)
            .set({
              attempts: row.attempts + 1,
              state: row.attempts + 1 >= 5 ? "invalid" : "sent",
            })
            .where(eq(challenges.id, challengeId));
          return null;
        }
        await tx
          .update(challenges)
          .set({
            state: "verified",
            grantDigest: key(`grant:${challengeId}`, grant),
            grantExpiresAt: new Date(+now + 300000),
          })
          .where(eq(challenges.id, challengeId));
        return { token: grant, expiresIn: 300 };
      });
      if (!result) throw invalid();
      return result;
    },
    async reset(
      challengeId: string,
      token: string,
      newPassword: string,
      clientKey: string,
    ) {
      recoveryResetInput.parse({
        action: "reset",
        challengeId,
        token,
        newPassword,
        confirmPassword: newPassword,
      });
      await actionLimit(clientKey);
      const result = await withChallenge(
        challengeId,
        async (tx, row, subject) => {
          const now = clock();
          if (
            row.state !== "verified" ||
            !row.grantExpiresAt ||
            row.grantExpiresAt <= now ||
            !matchesDigest(row.grantDigest, key(`grant:${challengeId}`, token))
          )
            return null;
          if (
            await verifyPassword({
              hash: subject.password,
              password: newPassword,
            })
          )
            return { reused: true };
          const hash = await hashPassword(newPassword);
          await tx
            .update(account)
            .set({ password: hash, updatedAt: now })
            .where(eq(account.id, subject.credentialId));
          await clearTemporaryPassword(tx, subject.userId, now);
          await tx.delete(session).where(eq(session.userId, subject.userId));
          await tx
            .update(challenges)
            .set({ state: "consumed", grantDigest: null })
            .where(eq(challenges.userId, subject.userId));
          await tx
            .update(userInvitations)
            .set({
              tokenHash: key("revoked-invitation", randomGrant()),
              generation: randomUUID(),
              messageCiphertext: null,
              updatedAt: now,
            })
            .where(eq(userInvitations.userId, subject.userId));
          await tx.insert(auditEvents).values({
            actorId: subject.userId,
            entity: "password-recovery",
            recordId: challengeId,
            action: "reset",
            after: {
              userId: subject.userId,
              passwordChanged: true,
              allSessionsRevoked: true,
              method: config.channel ?? "whatsapp",
            },
            createdAt: now,
          });
          return { reused: false };
        },
      );
      if (!result) throw invalid();
      if (result.reused)
        throw new AppError(
          "PASSWORD_REUSED",
          "Elegí una contraseña diferente de la actual.",
          400,
        );
    },
  };
}
