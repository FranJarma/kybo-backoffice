import { and, eq, isNull } from "drizzle-orm";
import type { Tx } from "@/db/types";
import { branchMemberships } from "@/db/branch-schema";
import { operationalUsers } from "@/db/auth-schema";
import { productionOrders } from "@/db/production-order-schema";
import type { OperationalContext } from "../operations/types";
import { AppError } from "@/lib/errors";

export function productionManager(ctx: OperationalContext) {
  if (ctx.role === "staff")
    throw new AppError(
      "FORBIDDEN",
      "Solo el encargado puede planificar o reasignar producción.",
      403,
    );
}
export function productionExecutor(
  ctx: OperationalContext,
  assignedTo: string | null,
) {
  if (ctx.role === "staff" && assignedTo !== ctx.actorId)
    throw new AppError(
      "FORBIDDEN",
      "Solo podés ejecutar las tareas que tenés asignadas.",
      403,
    );
}
export async function requireAssignee(
  tx: Tx,
  branchId: string,
  userId: string,
) {
  const [account] = await tx
    .select()
    .from(operationalUsers)
    .where(eq(operationalUsers.userId, userId))
    .for("share");
  const [membership] = await tx
    .select()
    .from(branchMemberships)
    .where(
      and(
        eq(branchMemberships.userId, userId),
        eq(branchMemberships.branchId, branchId),
        isNull(branchMemberships.revokedAt),
      ),
    )
    .for("share");
  if (!account || account.disabled || (account.role !== "admin" && !membership))
    throw new AppError(
      "PRODUCTION_ASSIGNEE",
      "Elegí una persona habilitada en esta sucursal.",
      409,
    );
}
export async function lockedProduction(
  tx: Tx,
  ctx: OperationalContext,
  id: string,
  revision: number,
) {
  const [order] = await tx
    .select()
    .from(productionOrders)
    .where(
      and(
        eq(productionOrders.id, id),
        eq(productionOrders.branchId, ctx.branchId),
      ),
    )
    .for("update");
  if (!order || order.revision !== revision)
    throw new AppError(
      "PRODUCTION_CONFLICT",
      "La orden cambió. Actualizá la lista.",
      409,
    );
  return order;
}
