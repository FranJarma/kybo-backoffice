import { and, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { userInvitations } from "@/db/invitations-schema";
import { identityCredentials } from "@/db/identity-schema";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import { invitationsSchemaReady } from "./availability";
import type { InvitationState } from "./types";
/** Opportunistic cleanup on login, administration and invitation reads. No background timer is claimed. */
export async function cleanupExpiredInvitationMessages(
  db: AppDb | Tx,
  now = new Date(),
) {
  await db
    .update(userInvitations)
    .set({ messageCiphertext: null })
    .where(
      and(
        isNotNull(userInvitations.messageCiphertext),
        lte(userInvitations.expiresAt, now),
      ),
    );
}
export async function isPendingActivation(db: AppDb | Tx, userId: string) {
  if (!(await invitationsSchemaReady(db))) return false;
  const [row] = await db
    .select({ activatedAt: userInvitations.activatedAt })
    .from(userInvitations)
    .where(eq(userInvitations.userId, userId));
  return !!row && !row.activatedAt;
}
export async function invitationStates(
  db: AppDb | Tx,
  now = new Date(),
): Promise<Map<string, InvitationState>> {
  if (!(await invitationsSchemaReady(db))) return new Map();
  await cleanupExpiredInvitationMessages(db, now);
  let rpId: string | undefined;
  try {
    rpId = new URL(process.env.BETTER_AUTH_URL ?? "").hostname;
  } catch {
    /* Older local fixtures need no configured deployment origin. */
  }
  const [rows, credentials] = await Promise.all([
    db.select().from(userInvitations),
    db
      .select({ userId: identityCredentials.userId })
      .from(identityCredentials)
      .where(
        and(
          isNull(identityCredentials.revokedAt),
          rpId ? eq(identityCredentials.rpId, rpId) : undefined,
        ),
      ),
  ]);
  return new Map(
    rows.map((row) => [
      row.userId,
      {
        status: row.activatedAt
          ? "activated"
          : row.expiresAt <= now
            ? "expired"
            : "pending",
        expiresAt: row.expiresAt.toISOString(),
        firstLoginAt: row.activatedAt?.toISOString() ?? null,
        verificationConfigured: credentials.some(
          (c) => c.userId === row.userId,
        ),
      },
    ]),
  );
}
