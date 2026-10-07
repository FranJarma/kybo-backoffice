import { createHash, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import { stockOperations } from "@/db/stock-schema";
import { requireOperationalContext } from "../branches/context";
import type { Actor } from "@/lib/access";
import type { CommandMeta, OperationalContext } from "./types";
import { AppError } from "@/lib/errors";

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
    const staffCommand = action === "complete" || action === "deliver";
    if (
      (!staffCommand && ctx.role === "staff") ||
      (action === "global-lot-recall" && ctx.role !== "admin")
    )
      throw new AppError(
        "FORBIDDEN",
        "Ya no tenés permiso para realizar o consultar esta operación.",
        403,
      );
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
    const result = await run(tx, ctx, id);
    await tx
      .update(stockOperations)
      .set({ result })
      .where(eq(stockOperations.id, id));
    return { result, operationId: id, replayed: false };
  });
}
