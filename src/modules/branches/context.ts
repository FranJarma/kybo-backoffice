import { and, eq, isNull } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import { operationalUsers } from "@/db/auth-schema";
import { branches, branchMemberships } from "@/db/branch-schema";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import type { OperationalContext } from "../operations/types";
import { authorizeBranch, authorizeCatalog } from "./authorization";

export async function requireOperationalContext(
  db: AppDb | Tx,
  actor: Actor,
  branchId: string,
): Promise<OperationalContext> {
  if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(branchId))
    throw new AppError("BRANCH_REQUIRED", "Seleccioná una sucursal.", 400);
  const [account] = await db
    .select()
    .from(operationalUsers)
    .where(eq(operationalUsers.userId, actor.id));
  const [branch] = await db
    .select()
    .from(branches)
    .where(and(eq(branches.id, branchId), isNull(branches.archivedAt)))
    .for("share");
  const [membership] = await db
    .select()
    .from(branchMemberships)
    .where(
      and(
        eq(branchMemberships.branchId, branchId),
        eq(branchMemberships.userId, actor.id),
        isNull(branchMemberships.revokedAt),
      ),
    );
  const role = authorizeBranch(account ?? null, membership?.role ?? null);
  if (!branch)
    throw new AppError(
      "BRANCH_UNAVAILABLE",
      "La sucursal no está disponible.",
      409,
    );
  return { actorId: actor.id, branchId, timeZone: branch.timeZone, role };
}
export async function requireCatalogManagement(
  db: AppDb | Tx,
  actor: Actor,
): Promise<void> {
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
