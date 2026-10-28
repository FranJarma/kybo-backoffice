import { and, eq } from "drizzle-orm";
import type { Tx } from "@/db/types";
import { cashPermissions } from "@/db/cash-schema";
import type { OperationalContext } from "@/modules/operations/types";
import { AppError } from "@/lib/errors";
import type { CashCapabilities } from "./types";
export async function cashCapabilities(
  tx: Tx,
  ctx: OperationalContext,
): Promise<CashCapabilities> {
  const manager = ctx.role !== "staff";
  const [grant] = manager
    ? []
    : await tx
        .select()
        .from(cashPermissions)
        .where(
          and(
            eq(cashPermissions.branchId, ctx.branchId),
            eq(cashPermissions.userId, ctx.actorId),
          ),
        );
  return {
    open: manager || !!grant?.canOpen,
    close: manager || !!grant?.canClose,
    expense: manager || !!grant?.canExpense,
    externalExpense: manager,
    withdraw: manager,
    supplier: manager,
    review: manager,
    admin: ctx.role === "admin",
  };
}
export async function authorizeCashCommand(
  tx: Tx,
  ctx: OperationalContext,
  raw: unknown,
) {
  const action = (raw as { action?: unknown })?.action;
  const capabilities = await cashCapabilities(tx, ctx);
  const permission =
    action === "open"
      ? "open"
      : action === "close"
        ? "close"
        : action === "expense"
          ? "expense"
          : action === "withdraw"
            ? "withdraw"
            : action === "review"
              ? "review"
              : null;
  if (!permission || !capabilities[permission])
    throw new AppError(
      "FORBIDDEN",
      "No tenés permiso para realizar esta acción de caja.",
      403,
    );
}
export async function authorizeCashRead(tx: Tx, ctx: OperationalContext) {
  const permissions = await cashCapabilities(tx, ctx);
  if (!permissions.open && !permissions.close && !permissions.expense)
    throw new AppError(
      "FORBIDDEN",
      "No tenés permiso para consultar Caja.",
      403,
    );
  return permissions;
}
