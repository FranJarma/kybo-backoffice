import { createHash, createHmac } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { and, asc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm";
import { user, operationalUsers, account, session } from "@/db/auth-schema";
import { branches, branchMemberships } from "@/db/branch-schema";
import { auditEvents } from "@/db/business-schema";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import type { Actor } from "@/lib/access";
import { provisionUser } from "@/lib/auth";
import { AppError } from "@/lib/errors";
import { userCommandSchema } from "./validation";
import type { ManagedUser, UsersSnapshot, UserRole } from "./types";

const forbidden = () =>
  new AppError(
    "FORBIDDEN",
    "Solo un administrador puede administrar usuarios.",
    403,
  );
const conflict = () =>
  new AppError(
    "CONFLICT",
    "La cuenta cambió. Actualizá la lista antes de guardar.",
    409,
  );
export async function requireUserAdministrator(db: AppDb | Tx, actor: Actor) {
  const [current] = await db
    .select()
    .from(operationalUsers)
    .where(eq(operationalUsers.userId, actor.id));
  if (!current || current.disabled || current.role !== "admin")
    throw forbidden();
}
// All administrative access writes use this order, including branch membership edits.
// Lock before checking the actor so revocation cannot race a privileged write.
export async function lockUserAdministration(tx: Tx, actor: Actor) {
  const operators = await tx
    .select()
    .from(operationalUsers)
    .orderBy(asc(operationalUsers.userId))
    .for("update");
  const administrator = operators.find(
    (operator) => operator.userId === actor.id,
  );
  if (
    !administrator ||
    administrator.disabled ||
    administrator.role !== "admin"
  )
    throw forbidden();
  return operators;
}
async function readUsers(db: AppDb | Tx, id?: string): Promise<ManagedUser[]> {
  const [rows, memberships] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        username: user.username,
        email: user.email,
        role: operationalUsers.role,
        disabled: operationalUsers.disabled,
        catalogManager: operationalUsers.catalogManager,
        profileUpdatedAt: user.updatedAt,
        accessUpdatedAt: operationalUsers.updatedAt,
        credentialUpdatedAt: account.updatedAt,
      })
      .from(user)
      .innerJoin(operationalUsers, eq(user.id, operationalUsers.userId))
      .leftJoin(
        account,
        and(
          eq(account.accountId, user.id),
          eq(account.providerId, "credential"),
        ),
      )
      .where(id ? eq(user.id, id) : undefined)
      .orderBy(asc(user.name), asc(user.id)),
    db
      .select({
        userId: branchMemberships.userId,
        branchId: branchMemberships.branchId,
        role: branchMemberships.role,
      })
      .from(branchMemberships)
      .innerJoin(branches, eq(branches.id, branchMemberships.branchId))
      .where(
        and(
          isNull(branchMemberships.revokedAt),
          isNull(branches.archivedAt),
          id ? eq(branchMemberships.userId, id) : undefined,
        ),
      )
      .orderBy(asc(branches.createdAt), asc(branches.id)),
  ]);
  return rows.map((row) => {
    const {
      profileUpdatedAt,
      accessUpdatedAt,
      credentialUpdatedAt,
      ...profile
    } = row;
    const safe = {
      ...profile,
      email: row.email.endsWith("@users.invalid") ? null : row.email,
      role: row.role as UserRole,
      memberships: memberships
        .filter((m) => m.userId === row.id)
        .map((m) => ({
          branchId: m.branchId,
          role: m.role as "manager" | "staff",
        })),
    };
    return {
      ...safe,
      version: createHash("sha256")
        .update(
          JSON.stringify({
            ...safe,
            profileUpdatedAt,
            accessUpdatedAt,
            credentialUpdatedAt,
          }),
        )
        .digest("hex"),
    };
  });
}
export async function listUsers(
  db: AppDb,
  actor: Actor,
): Promise<UsersSnapshot> {
  await requireUserAdministrator(db, actor);
  const [rows, available] = await Promise.all([
    readUsers(db),
    db
      .select({ id: branches.id, name: branches.name })
      .from(branches)
      .where(isNull(branches.archivedAt))
      .orderBy(asc(branches.createdAt), asc(branches.id)),
  ]);
  return { currentUserId: actor.id, rows, branches: available };
}
export async function saveUser(
  db: AppDb,
  actor: Actor,
  raw: unknown,
): Promise<{ id: string; replayed: boolean }> {
  await requireUserAdministrator(db, actor);
  const input = userCommandSchema.parse(raw);
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret || secret.length < 32)
    throw new AppError(
      "UNAVAILABLE",
      "La configuración de autenticación no está disponible.",
      503,
    );
  // HMAC prevents the audit fingerprint from being an offline password verifier.
  const fingerprint = createHmac("sha256", secret)
    .update(
      JSON.stringify({
        ...input,
        memberships: [...input.memberships].sort((a, b) =>
          a.branchId.localeCompare(b.branchId),
        ),
      }),
    )
    .digest("hex");
  const passwordHash =
    input.password && input.id ? await hashPassword(input.password) : undefined;
  try {
    return await db.transaction(async (tx) => {
      await lockUserAdministration(tx, actor);
      const [prior] = await tx
        .select()
        .from(auditEvents)
        .where(
          and(
            eq(auditEvents.entity, "user-management"),
            eq(auditEvents.recordId, input.requestId),
          ),
        )
        .limit(1);
      if (prior) {
        const result = prior.after as { userId: string; fingerprint: string };
        if (prior.actorId !== actor.id || result.fingerprint !== fingerprint)
          throw conflict();
        return { id: result.userId, replayed: true };
      }
      const before = input.id ? (await readUsers(tx, input.id))[0] : undefined;
      if (input.id && !before)
        throw new AppError("NOT_FOUND", "La cuenta no está disponible.", 404);
      if (before && before.version !== input.version) throw conflict();
      if (input.id === actor.id && (input.disabled || input.role !== "admin"))
        throw new AppError(
          "VALIDATION",
          "No podés desactivar tu propia cuenta ni quitarte el rol de administrador.",
          400,
        );
      const branchIds = input.memberships.map((m) => m.branchId);
      if (branchIds.length) {
        const active = await tx
          .select({ id: branches.id })
          .from(branches)
          .where(
            and(inArray(branches.id, branchIds), isNull(branches.archivedAt)),
          )
          .orderBy(asc(branches.id))
          .for("share");
        if (active.length !== branchIds.length)
          throw new AppError("VALIDATION", "Elegí sucursales activas.", 400);
      }
      const [duplicate] = await tx
        .select({ id: user.id })
        .from(user)
        .where(
          and(
            input.id ? ne(user.id, input.id) : undefined,
            or(
              sql`lower(${user.username}) = ${input.username}`,
              input.email
                ? sql`lower(${user.email}) = ${input.email}`
                : undefined,
            ),
          ),
        )
        .limit(1);
      if (duplicate)
        throw new AppError(
          "CONFLICT",
          "El usuario o correo ya está en uso.",
          409,
        );
      const id =
        input.id ??
        (await provisionUser(tx, {
          name: input.name,
          username: input.username,
          email: input.email || undefined,
          password: input.password,
          role: input.role,
        }));
      if (input.id) {
        await tx
          .update(user)
          .set({
            name: input.name,
            username: input.username || null,
            email:
              input.email ||
              (before?.email
                ? `${crypto.randomUUID()}@users.invalid`
                : undefined),
            emailVerified: input.email === before?.email ? undefined : false,
            updatedAt: new Date(),
          })
          .where(eq(user.id, id));
        if (passwordHash)
          await tx
            .insert(account)
            .values({
              id: crypto.randomUUID(),
              accountId: id,
              providerId: "credential",
              userId: id,
              password: passwordHash,
            })
            .onConflictDoUpdate({
              target: [account.providerId, account.accountId],
              set: { password: passwordHash, updatedAt: new Date() },
            });
      }
      await tx
        .update(operationalUsers)
        .set({
          role: input.role,
          disabled: input.disabled,
          catalogManager: input.role !== "admin" && input.catalogManager,
          updatedAt: new Date(),
        })
        .where(eq(operationalUsers.userId, id));
      await tx
        .update(branchMemberships)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(branchMemberships.userId, id),
            isNull(branchMemberships.revokedAt),
          ),
        );
      for (const membership of input.memberships)
        await tx
          .insert(branchMemberships)
          .values({ ...membership, userId: id })
          .onConflictDoUpdate({
            target: [branchMemberships.branchId, branchMemberships.userId],
            set: { role: membership.role, revokedAt: null },
          });
      const [after] = await readUsers(tx, id);
      const accessChanged =
        before &&
        (before.role !== after.role ||
          before.disabled !== after.disabled ||
          before.catalogManager !== after.catalogManager ||
          JSON.stringify(before.memberships) !==
            JSON.stringify(after.memberships) ||
          before.username !== after.username ||
          before.email !== after.email);
      if (input.disabled || passwordHash || accessChanged)
        await tx.delete(session).where(eq(session.userId, id));
      await tx.insert(auditEvents).values({
        actorId: actor.id,
        entity: "user-management",
        recordId: input.requestId,
        action: input.id ? "update" : "create",
        before: before ?? null,
        after: {
          userId: id,
          profile: after,
          passwordChanged: !!input.password,
          fingerprint,
        },
      });
      return { id, replayed: false };
    });
  } catch (error) {
    let cause: unknown = error;
    for (
      let depth = 0;
      depth < 4 && cause && typeof cause === "object";
      depth++
    ) {
      if ("code" in cause && cause.code === "23505")
        throw new AppError(
          "CONFLICT",
          "El usuario o correo ya está en uso.",
          409,
        );
      cause = "cause" in cause ? cause.cause : null;
    }
    throw error;
  }
}
