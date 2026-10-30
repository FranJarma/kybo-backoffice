import { randomBytes, randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, eq, isNull } from "drizzle-orm";
import {
  userInvitations,
  invitationRequests,
  identityEnrollmentGrants,
} from "@/db/invitations-schema";
import { account, operationalUsers, session, user } from "@/db/auth-schema";
import { branches, branchMemberships } from "@/db/branch-schema";
import { attendanceParticipants } from "@/db/attendance-schema";
import { auditEvents } from "@/db/business-schema";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import type { Actor } from "@/lib/access";
import { provisionUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import {
  lockUserAdministration,
  requireUserAdministrator,
} from "@/modules/users/service";
import { getStoreProfile } from "@/modules/workplace/access";
import { invitationsSchemaReady } from "./availability";
import { cleanupExpiredInvitationMessages } from "./queries";
import { invitationCommandSchema } from "./validation";
import {
  invitationHash,
  invitationSecret,
  sealInvitation,
  unsealInvitation,
} from "./crypto";
import type { InvitationMessage } from "./types";
const conflict = () =>
  new AppError(
    "CONFLICT",
    "La invitación cambió. Actualizá la lista antes de continuar.",
    409,
  );
async function reveal(
  tx: Tx,
  userId: string,
  secret: string,
  now: Date,
  generation?: string,
): Promise<InvitationMessage | null> {
  const [row] = await tx
    .select()
    .from(userInvitations)
    .where(eq(userInvitations.userId, userId));
  const [permissions] = await tx
    .select()
    .from(operationalUsers)
    .where(eq(operationalUsers.userId, userId));
  if (
    !row ||
    row.activatedAt ||
    row.expiresAt <= now ||
    !row.messageCiphertext ||
    permissions?.disabled ||
    (generation && row.generation !== generation)
  )
    return null;
  return unsealInvitation(
    row.messageCiphertext,
    row.generation,
    secret,
  ) as InvitationMessage;
}
export async function saveInvitation(
  db: AppDb,
  actor: Actor,
  raw: unknown,
  now = new Date(),
): Promise<{
  id: string;
  replayed: boolean;
  invitation: InvitationMessage | null;
}> {
  await requireUserAdministrator(db, actor);
  const input = invitationCommandSchema.parse(raw),
    secret = invitationSecret();
  if (!(await invitationsSchemaReady(db)))
    throw new AppError(
      "INVITATION_SETUP",
      "Administración debe completar la activación de invitaciones.",
      503,
    );
  const fingerprint = invitationHash(JSON.stringify(input), secret);
  return db.transaction(async (tx) => {
    await lockUserAdministration(tx, actor);
    await cleanupExpiredInvitationMessages(tx, now);
    if (input.action === "invite-reveal")
      return {
        id: input.userId,
        replayed: false,
        invitation: await reveal(tx, input.userId, secret, now),
      };
    const [prior] = await tx
      .select()
      .from(invitationRequests)
      .where(eq(invitationRequests.requestId, input.requestId));
    if (prior) {
      if (prior.actorId !== actor.id || prior.fingerprint !== fingerprint)
        throw conflict();
      return {
        id: prior.userId,
        replayed: true,
        invitation: await reveal(
          tx,
          prior.userId,
          secret,
          now,
          prior.generation,
        ),
      };
    }
    let id: string, username: string, branchId: string;
    const password = randomBytes(24).toString("base64url"),
      token = randomBytes(32).toString("base64url"),
      generation = randomUUID();
    if (input.action === "invite-create") {
      const [branch] = await tx
        .select()
        .from(branches)
        .where(
          and(eq(branches.id, input.branchId), isNull(branches.archivedAt)),
        )
        .for("share");
      if (!branch)
        throw new AppError("VALIDATION", "Elegí una sucursal activa.", 400);
      const base =
        input.name
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .replace(/[^a-z0-9]/g, ".")
          .replace(/\.+/g, ".")
          .replace(/^\.|\.$/g, "")
          .slice(0, 16) || "personal";
      username = base + "." + randomBytes(5).toString("hex");
      branchId = input.branchId;
      id = await provisionUser(tx, {
        name: input.name,
        username,
        password,
        role: input.role,
        branchId,
      });
      await tx.insert(attendanceParticipants).values({
        userId: id,
        branchId,
        enabled: input.attendanceEnabled,
        updatedBy: actor.id,
      });
    } else {
      id = input.userId;
      const [profile] = await tx
        .select({
          username: user.username,
          disabled: operationalUsers.disabled,
        })
        .from(user)
        .innerJoin(operationalUsers, eq(operationalUsers.userId, user.id))
        .where(eq(user.id, id))
        .for("update");
      const [invitation] = await tx
        .select()
        .from(userInvitations)
        .where(eq(userInvitations.userId, id))
        .for("update");
      if (
        !profile ||
        profile.disabled ||
        !profile.username ||
        !invitation ||
        invitation.activatedAt ||
        (await getStoreProfile(tx, id))
      )
        throw conflict();
      username = profile.username;
      branchId = invitation.branchId;
      const [membership] = await tx
        .select()
        .from(branchMemberships)
        .where(
          and(
            eq(branchMemberships.userId, id),
            eq(branchMemberships.branchId, branchId),
            isNull(branchMemberships.revokedAt),
          ),
        );
      const [branch] = await tx
        .select()
        .from(branches)
        .where(and(eq(branches.id, branchId), isNull(branches.archivedAt)))
        .for("share");
      if (!membership || !branch) throw conflict();
      await tx
        .update(account)
        .set({ password: await hashPassword(password), updatedAt: now })
        .where(
          and(eq(account.userId, id), eq(account.providerId, "credential")),
        );
      await tx.delete(session).where(eq(session.userId, id));
      await tx
        .delete(identityEnrollmentGrants)
        .where(eq(identityEnrollmentGrants.userId, id));
    }
    const expiresAt = new Date(now.getTime() + input.validityHours * 3600000);
    const baseURL = process.env.BETTER_AUTH_URL ?? "";
    let origin: string;
    try {
      const url = new URL(baseURL);
      if (
        url.protocol !== "https:" &&
        !(
          url.protocol === "http:" &&
          ["localhost", "127.0.0.1"].includes(url.hostname)
        )
      )
        throw new Error();
      origin = url.origin;
    } catch {
      throw new AppError(
        "INVITATION_CONFIG",
        "Falta configurar la dirección de acceso a Kybo.",
        503,
      );
    }
    const url = origin + "/invite#" + token;
    const message = `Te invitamos a Kybo.\nAbrí ${url}\nUsuario: ${username}\nContraseña inicial: ${password}\nLa invitación vence el ${expiresAt.toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires", hour12: false })}.\nAl ingresar, activá la verificación de tu celular.`;
    const payload: InvitationMessage = {
      username,
      password,
      token,
      url,
      message,
      expiresAt: expiresAt.toISOString(),
    };
    const values = {
      userId: id,
      tokenHash: invitationHash(token, secret),
      generation,
      branchId,
      expiresAt,
      messageCiphertext: sealInvitation(payload, generation, secret),
      createdBy: actor.id,
      updatedAt: now,
    };
    await tx
      .insert(userInvitations)
      .values(values)
      .onConflictDoUpdate({ target: userInvitations.userId, set: values });
    await tx.insert(invitationRequests).values({
      requestId: input.requestId,
      actorId: actor.id,
      userId: id,
      generation,
      fingerprint,
      createdAt: now,
    });
    await tx.insert(auditEvents).values({
      actorId: actor.id,
      entity: "user-invitation",
      recordId: input.requestId,
      action: input.action === "invite-create" ? "create" : "renew",
      after: { userId: id, generation, expiresAt: expiresAt.toISOString() },
      createdAt: now,
    });
    return { id, replayed: false, invitation: payload };
  });
}
