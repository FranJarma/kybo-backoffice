import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import type { Actor } from "@/lib/access";
import { user } from "@/db/auth-schema";
import { workplaceStoreAccounts } from "@/db/workplace-schema";
import { auditEvents } from "@/db/business-schema";
import { passwordRecoveryContacts as contacts } from "@/db/password-recovery-schema";
import {
  lockUserAdministration,
  requireUserAdministrator,
} from "@/modules/users/service";
import { AppError } from "@/lib/errors";
import { recoveryUnavailable } from "./provider";
import { recoveryContactInput, type RecoveryContactState } from "./validation";
export async function recoverySchemaReady(db: AppDb | Tx) {
  const result = await db.execute(
    sql`select to_regclass('public.password_recovery_contacts') is not null and to_regclass('public.password_recovery_challenges') is not null and to_regclass('public.password_recovery_limits') is not null and to_regclass('public.user_password_policies') is not null and to_regclass('public.workplace_store_accounts') is not null and to_regclass('public.user_invitations') is not null as ready`,
  );
  return result.rows[0]?.ready === true;
}
export async function getRecoveryContact(
  db: AppDb,
  actor: Actor,
  userId: string,
): Promise<RecoveryContactState> {
  await requireUserAdministrator(db, actor);
  if (!(await recoverySchemaReady(db)))
    return {
      ready: false,
      phone: null,
      enabled: false,
      confirmed: false,
      version: null,
    };
  const [row] = await db
    .select()
    .from(contacts)
    .where(eq(contacts.userId, userId));
  return {
    ready: true,
    phone: row?.phone ?? null,
    enabled: row?.enabled ?? false,
    confirmed: !!row?.confirmedAt,
    version: row?.version ?? null,
  };
}
export async function saveRecoveryContact(
  db: AppDb,
  actor: Actor,
  userId: string,
  raw: unknown,
): Promise<RecoveryContactState> {
  const input = recoveryContactInput.parse(raw);
  if (!(await recoverySchemaReady(db))) throw recoveryUnavailable();
  try {
    await db.transaction(async (tx) => {
      await lockUserAdministration(tx, actor);
      const [target] = await tx
        .select({ id: user.id })
        .from(user)
        .where(eq(user.id, userId))
        .for("update");
      if (!target)
        throw new AppError("NOT_FOUND", "No se encontró la cuenta.", 404);
      if (
        (
          await tx
            .select()
            .from(workplaceStoreAccounts)
            .where(eq(workplaceStoreAccounts.userId, userId))
        ).length
      )
        throw new AppError(
          "FORBIDDEN",
          "La cuenta del local se recupera desde Administración.",
          403,
        );
      const [before] = await tx
        .select()
        .from(contacts)
        .where(eq(contacts.userId, userId))
        .for("update");
      if ((before?.version ?? null) !== input.version)
        throw new AppError(
          "CONFLICT",
          "El contacto cambió. Actualizá antes de guardar.",
          409,
        );
      const values = {
        phone: input.phone || null,
        enabled: input.enabled,
        version: randomUUID(),
        confirmedAt: input.confirmed && input.phone ? new Date() : null,
        updatedBy: actor.id,
        updatedAt: new Date(),
      };
      await tx
        .insert(contacts)
        .values({ userId, ...values })
        .onConflictDoUpdate({ target: contacts.userId, set: values });
      await tx.insert(auditEvents).values({
        actorId: actor.id,
        entity: "password-recovery-contact",
        recordId: values.version,
        action: "configure",
        after: {
          userId,
          enabled: values.enabled,
          phoneConfigured: !!values.phone,
          confirmed: !!values.confirmedAt,
        },
      });
    });
  } catch (error) {
    const e = error as { code?: string; cause?: { code?: string } };
    if (e.code === "23505" || e.cause?.code === "23505")
      throw new AppError(
        "CONFLICT",
        "Ese WhatsApp ya está asignado a otra cuenta.",
        409,
      );
    throw error;
  }
  return getRecoveryContact(db, actor, userId);
}
