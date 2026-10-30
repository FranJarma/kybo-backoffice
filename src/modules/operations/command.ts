import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { productionOrders } from "@/db/production-order-schema";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import { stockOperations } from "@/db/stock-schema";
import { requireOperationalContext } from "../branches/context";
import type { Actor } from "@/lib/access";
import type { CommandMeta, OperationalContext } from "./types";
import { AppError } from "@/lib/errors";
import { authorizeTaskCommand } from "../daily-operations/access";
import { authorizeCashCommand } from "../cash/access";
import { lockCashConfiguration, refreshCashContext } from "../cash/integration";
import { identityRequired } from "../identity/confirmation";
import { consumeConfirmation } from "../identity/service";
import { getStoreProfile } from "../workplace/access";
import {
  requireDeliveryAccess,
  requirePersonalProductionAccess,
} from "../staff-work/access";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)]),
    );
  return value;
}
/** Owns both idempotency and the transaction. Nested domain functions never claim keys. */
export async function executeCommand<T>(
  db: AppDb,
  actor: Actor,
  branchId: string,
  meta: CommandMeta,
  action: string,
  payload: unknown,
  run: (tx: Tx, ctx: OperationalContext, operationId: string) => Promise<T>,
  transactionConfig?: { isolationLevel: "repeatable read" },
): Promise<{ result: T; operationId: string; replayed: boolean }> {
  if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(meta.requestId))
    throw new AppError(
      "VALIDATION",
      "Falta una clave de operación válida.",
      400,
    );
  const fingerprint = createHash("sha256")
    .update(JSON.stringify(canonical({ action, branchId, payload })))
    .digest("hex");
  return db.transaction(async (tx) => {
    // Current membership is checked even for a successful replay.
    const ctx = await requireOperationalContext(tx, actor, branchId);
    // Command-level authorization runs before claiming or replaying an operation.
    // Unknown/future commands default to manager access until explicitly classified.
    const productionCommand =
      action === "production-start" || action === "production-finish";
    const staffCommand =
      action === "complete" ||
      action === "deliver" ||
      productionCommand ||
      action === "daily-task";
    const cashCommand = action === "cash";
    if (
      (!staffCommand && !cashCommand && ctx.role === "staff") ||
      (action === "cash-settings" && ctx.role !== "admin") ||
      (action === "global-lot-recall" && ctx.role !== "admin")
    )
      throw new AppError(
        "FORBIDDEN",
        "Ya no tenés permiso para realizar o consultar esta operación.",
        403,
      );
    // The live context already resolves account kind; legacy internal contexts
    // still check the persistent marker, after the cheap command-role rejection.
    if (
      (ctx.accountKind === "store" ||
        (ctx.accountKind === undefined && (await getStoreProfile(tx, actor.id)))) &&
      action !== "deliver"
    )
      throw new AppError(
        "FORBIDDEN",
        "La cuenta del local solo puede registrar la entrega desde este circuito.",
        403,
      );
    if (action === "deliver") await requireDeliveryAccess(tx, ctx);
    const dailyTask =
      action === "daily-task"
        ? await authorizeTaskCommand(tx, ctx, payload)
        : null;
    if (
      dailyTask?.kind === "production" &&
      dailyTask.documentId &&
      (payload as { action?: string })?.action === "start"
    )
      await requirePersonalProductionAccess(tx, ctx, dailyTask.documentId);
    if (cashCommand) await authorizeCashCommand(tx, ctx, payload);
    if (ctx.role === "staff" && productionCommand) {
      const orderId = (payload as { id?: unknown })?.id;
      const [order] =
        typeof orderId === "string"
          ? await tx
              .select({ assignedTo: productionOrders.assignedTo })
              .from(productionOrders)
              .where(
                and(
                  eq(productionOrders.id, orderId),
                  eq(productionOrders.branchId, branchId),
                ),
              )
              .for("update")
          : [];
      if (!order || order.assignedTo !== ctx.actorId)
        throw new AppError(
          "FORBIDDEN",
          "Solo podés ejecutar las tareas que tenés asignadas.",
          403,
        );
      await requirePersonalProductionAccess(tx, ctx, String(orderId));
    }
    const id = randomUUID();
    const [claimed] = await tx
      .insert(stockOperations)
      .values({
        id,
        requestId: meta.requestId,
        branchId,
        actorId: actor.id,
        action,
        fingerprint,
      })
      .onConflictDoNothing()
      .returning();
    if (cashCommand || action === "cash-settings") {
      // Keep the common identity-then-branch lock order, including replay.
      await lockCashConfiguration(tx, branchId);
      await refreshCashContext(tx, ctx);
      if (action === "cash-settings" && ctx.role !== "admin")
        throw new AppError(
          "FORBIDDEN",
          "Solo Administración puede configurar Caja.",
          403,
        );
      if (cashCommand) await authorizeCashCommand(tx, ctx, payload);
    }
    if (!claimed) {
      const [previous] = await tx
        .select()
        .from(stockOperations)
        .where(eq(stockOperations.requestId, meta.requestId));
      if (
        !previous ||
        previous.actorId !== actor.id ||
        previous.branchId !== branchId ||
        previous.fingerprint !== fingerprint ||
        previous.result === null
      )
        throw new AppError(
          "IDEMPOTENCY_CONFLICT",
          "La clave ya corresponde a otra operación.",
          409,
        );
      return {
        result: previous.result as T,
        operationId: previous.id,
        replayed: true,
      };
    }
    const confirmationAction =
      action === "production-start" ||
      (dailyTask?.kind === "production" &&
        (payload as { action?: string })?.action === "start")
        ? "production-start"
        : cashCommand && (payload as { action?: string })?.action === "close"
          ? "cash-close"
          : null;
    if (confirmationAction && (await identityRequired(tx, branchId))) {
      await consumeConfirmation(
        tx,
        actor,
        {
          action: confirmationAction,
          branchId,
          requestId: meta.requestId,
          payload,
        },
        meta.verificationId,
      );
    }
    const result = await run(tx, ctx, id);
    await tx
      .update(stockOperations)
      .set({ result })
      .where(eq(stockOperations.id, id));
    return { result, operationId: id, replayed: false };
  }, transactionConfig);
}
