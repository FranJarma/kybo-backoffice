import { and, eq, isNull, sql } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import { operationalUsers } from "@/db/auth-schema";
import { branches, branchMemberships } from "@/db/branch-schema";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import type { OperationalContext } from "../operations/types";
import { authorizeBranch, authorizeCatalog } from "./authorization";
import { getStoreProfile } from "@/modules/workplace/access";
import { isPendingActivation } from "@/modules/invitations/queries";
import { workplaceStoreAccounts } from "@/db/workplace-schema";
import { userInvitations } from "@/db/invitations-schema";

async function requireActivatedAccount(db: AppDb | Tx, userId: string) {
  if (await isPendingActivation(db, userId))
    throw new AppError(
      "FORBIDDEN",
      "Completá el primer ingreso con una invitación vigente para usar tu cuenta.",
      403,
    );
}

export async function requireAdministrator(db: AppDb | Tx, actor: Actor) {
  await requireActivatedAccount(db, actor.id);
  const [account] = await db
    .select()
    .from(operationalUsers)
    .where(eq(operationalUsers.userId, actor.id))
    .for("share");
  if (
    !account ||
    account.disabled ||
    account.role !== "admin" ||
    (await getStoreProfile(db, actor.id))
  )
    throw new AppError(
      "FORBIDDEN",
      "Esta configuración requiere permiso de administrador.",
      403,
    );
}

export async function requireOperationalContext(
  db: AppDb | Tx,
  actor: Actor,
  branchId: string,
): Promise<OperationalContext> {
  if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(branchId))
    throw new AppError("BRANCH_REQUIRED", "Seleccioná una sucursal.", 400);
  const [branch] = await db
    .select({
      id: branches.id,
      timeZone: branches.timeZone,
      storeAvailable: sql<boolean>`to_regclass('public.workplace_store_accounts') is not null`,
      invitationsAvailable: sql<boolean>`to_regclass('public.user_invitations') is not null`,
    })
    .from(branches)
    .where(and(eq(branches.id, branchId), isNull(branches.archivedAt)))
    .for("share");
  // Resolve permissions after any wait on the branch lock, with a fresh snapshot.
  const accessQuery = db
    .select({
      account: operationalUsers,
      membership: branchMemberships,
      storeUserId: branch?.storeAvailable
        ? workplaceStoreAccounts.userId
        : sql<string | null>`null`,
      storeBranchId: branch?.storeAvailable
        ? workplaceStoreAccounts.branchId
        : sql<string | null>`null`,
      storeEnabled: branch?.storeAvailable
        ? workplaceStoreAccounts.enabled
        : sql<boolean | null>`null`,
      pendingActivation: branch?.invitationsAvailable
        ? sql<boolean>`${userInvitations.userId} is not null and ${userInvitations.activatedAt} is null`
        : sql<boolean>`false`,
    })
    .from(operationalUsers)
    .leftJoin(
      branchMemberships,
      and(
        eq(branchMemberships.branchId, branchId),
        eq(branchMemberships.userId, operationalUsers.userId),
        isNull(branchMemberships.revokedAt),
      ),
    )
    .$dynamic();
  // Each optional table is detected independently by the branch query. Never
  // cache absence: the next request must observe a newly installed migration.
  if (branch?.storeAvailable)
    accessQuery.leftJoin(
      workplaceStoreAccounts,
      eq(workplaceStoreAccounts.userId, operationalUsers.userId),
    );
  if (branch?.invitationsAvailable)
    accessQuery.leftJoin(
      userInvitations,
      eq(userInvitations.userId, operationalUsers.userId),
    );
  const [access] = await accessQuery.where(
    eq(operationalUsers.userId, actor.id),
  );
  const role = authorizeBranch(
    access?.account ?? null,
    access?.membership?.role ?? null,
  );
  if (access?.pendingActivation)
    throw new AppError(
      "FORBIDDEN",
      "Completá el primer ingreso con una invitación vigente para usar tu cuenta.",
      403,
    );
  const store = access?.storeUserId
    ? { branchId: access.storeBranchId, enabled: access.storeEnabled }
    : null;
  if (store || actor.accountKind === "store") {
    if (
      !store?.enabled ||
      store.branchId !== branchId ||
      access?.account.role !== "staff" ||
      access.account.catalogManager ||
      role !== "staff"
    )
      throw new AppError(
        "FORBIDDEN",
        "El puesto compartido no está habilitado para esta sucursal o sus permisos cambiaron.",
        403,
      );
  }
  if (!branch) {
    throw new AppError(
      "BRANCH_UNAVAILABLE",
      "La sucursal no está disponible.",
      409,
    );
  }
  return {
    actorId: actor.id,
    branchId,
    timeZone: branch.timeZone,
    role,
    sessionId: actor.sessionId,
    accountKind: store ? "store" : "personal",
  };
}
export async function requireCatalogManagement(
  db: AppDb | Tx,
  actor: Actor,
): Promise<void> {
  await requireActivatedAccount(db, actor.id);
  if (await getStoreProfile(db, actor.id))
    throw new AppError(
      "FORBIDDEN",
      "La cuenta del local no administra el catálogo.",
      403,
    );
  const [account] = await db
    .select()
    .from(operationalUsers)
    .where(eq(operationalUsers.userId, actor.id));
  authorizeCatalog(account ?? null);
}
export async function requireCatalogRead(
  db: AppDb | Tx,
  actor: Actor,
): Promise<void> {
  await requireActivatedAccount(db, actor.id);
  if (await getStoreProfile(db, actor.id))
    throw new AppError(
      "FORBIDDEN",
      "La cuenta del local consulta la carta desde el punto de venta.",
      403,
    );
  const [account] = await db
    .select()
    .from(operationalUsers)
    .where(eq(operationalUsers.userId, actor.id));
  if (!account || account.disabled)
    throw new AppError("FORBIDDEN", "La cuenta no está habilitada.", 403);
  if (account.role === "admin" || account.catalogManager) return;
  const ctx = await requireOperationalContext(db, actor, actor.branchId ?? "");
  if (ctx.role === "staff")
    throw new AppError(
      "FORBIDDEN",
      "Se requiere permiso de encargado para consultar el catálogo.",
      403,
    );
}
