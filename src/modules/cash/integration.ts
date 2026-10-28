import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import { cashSettings, cashSessions, cashMovements } from "@/db/cash-schema";
import type { OperationalContext } from "@/modules/operations/types";
import { AppError } from "@/lib/errors";
import { requireOperationalContext } from "@/modules/branches/context";
import type { CashMovementInput } from "./types";
import { cashAmount, cashCents } from "./calculation";
type Session = typeof cashSessions.$inferSelect;
type Lock = {
  branchId: string;
  activated: boolean;
  session: Session | null;
  balance?: bigint;
};
const locks = new WeakMap<object, Lock>();
export async function refreshCashContext(tx: Tx, ctx: OperationalContext) {
  const current = await requireOperationalContext(
    tx,
    { id: ctx.actorId, role: ctx.role, branchId: ctx.branchId },
    ctx.branchId,
  );
  Object.assign(ctx, current);
  return ctx;
}
export async function cashAvailable(db: AppDb | Tx): Promise<boolean> {
  const result = await db.execute(
    sql`select to_regclass('public.cash_sessions') as name`,
  );
  return !!result.rows[0]?.name;
}
/** One ordering for opening, closing, payments and administration, including first use. */
export async function lockCashConfiguration(tx: Tx, branchId: string) {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`cash:${branchId}`}))`,
  );
  const [settings] = await tx
    .select()
    .from(cashSettings)
    .where(eq(cashSettings.branchId, branchId))
    .for("update");
  return settings ?? null;
}
/** ctx comes from requireOperationalContext inside this transaction, never from the client. */
export async function lockCashSession(
  tx: Tx,
  ctx: OperationalContext,
  options: { requireOpen?: boolean } = {},
): Promise<Session | null> {
  let lock = locks.get(tx);
  if (lock && lock.branchId !== ctx.branchId)
    throw new AppError(
      "FORBIDDEN",
      "La operación no corresponde a esta sucursal.",
      403,
    );
  if (!lock) {
    if (!(await cashAvailable(tx))) return null;
    const settings = await lockCashConfiguration(tx, ctx.branchId);
    await refreshCashContext(tx, ctx);
    const [session] = settings?.activatedAt
      ? await tx
          .select()
          .from(cashSessions)
          .where(
            and(
              eq(cashSessions.branchId, ctx.branchId),
              eq(cashSessions.state, "open"),
            ),
          )
          .for("update")
      : [];
    lock = {
      branchId: ctx.branchId,
      activated: !!settings?.activatedAt,
      session: session ?? null,
    };
    locks.set(tx, lock);
  }
  if (lock.activated && !lock.session && options.requireOpen !== false)
    throw new AppError(
      "CASH_CLOSED",
      "Abrí la caja antes de registrar cobros o salidas de efectivo.",
      409,
    );
  return lock.session;
}
export async function recordCashMovement(
  tx: Tx,
  ctx: OperationalContext,
  input: CashMovementInput,
): Promise<string | null> {
  const session = await lockCashSession(tx, ctx);
  if (!session) return null;
  if (
    ctx.role === "staff" &&
    ["refund", "withdrawal", "supplier", "advance"].includes(input.kind)
  )
    throw new AppError(
      "FORBIDDEN",
      "Esta salida requiere permiso vigente de encargado.",
      403,
    );
  const value = cashCents(input.amount, true),
    normalized = cashAmount(value);
  if (
    (input.kind === "collection" && value <= 0n) ||
    (input.kind !== "collection" && value >= 0n)
  )
    throw new AppError(
      "VALIDATION",
      "El signo del movimiento de caja no corresponde a su operación.",
      400,
    );
  const lock = locks.get(tx)!;
  if (input.methodKind === "cash" && value < 0n) {
    if (lock.balance === undefined) {
      const [sum] = await tx
        .select({
          amount: sql<string>`coalesce(sum(${cashMovements.amount}),0)::numeric(14,2)::text`,
        })
        .from(cashMovements)
        .where(
          and(
            eq(cashMovements.sessionId, session.id),
            eq(cashMovements.methodKind, "cash"),
          ),
        );
      lock.balance = cashCents(sum.amount, true);
    }
  }
  const [saved] = await tx
    .insert(cashMovements)
    .values({
      id: randomUUID(),
      sessionId: session.id,
      branchId: ctx.branchId,
      actorId: ctx.actorId,
      kind: input.kind,
      amount: normalized,
      methodKind: input.methodKind,
      methodName: input.methodName,
      concept: input.concept,
      reference: input.reference ?? null,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      createdAt: input.occurredAt ?? new Date(),
    })
    .onConflictDoNothing({
      target: [cashMovements.sourceType, cashMovements.sourceId],
    })
    .returning({ id: cashMovements.id });
  if (!saved) {
    const [existing] = await tx
      .select()
      .from(cashMovements)
      .where(
        and(
          eq(cashMovements.sourceType, input.sourceType),
          eq(cashMovements.sourceId, input.sourceId),
        ),
      );
    if (
      !existing ||
      existing.branchId !== ctx.branchId ||
      existing.amount !== normalized ||
      existing.kind !== input.kind ||
      existing.methodKind !== input.methodKind
    )
      throw new AppError(
        "IDEMPOTENCY_CONFLICT",
        "El movimiento ya corresponde a otra operación.",
        409,
      );
    return existing.sessionId;
  }
  if (input.methodKind === "cash" && value < 0n && lock.balance! + value < 0n)
    throw new AppError(
      "CASH_INSUFFICIENT",
      "El importe supera el efectivo esperado en caja.",
      409,
    );
  if (lock.balance !== undefined && input.methodKind === "cash")
    lock.balance += value;
  await tx
    .update(cashSessions)
    .set({ revision: sql`${cashSessions.revision}+1` })
    .where(eq(cashSessions.id, session.id));
  session.revision++;
  return session.id;
}
