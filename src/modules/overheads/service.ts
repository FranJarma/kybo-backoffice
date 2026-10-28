import { and, desc, eq, gte, lt, ne, sql, getTableColumns } from "drizzle-orm";
import { user } from "@/db/auth-schema";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import { expensePeriods, expenseClosures } from "@/db/overhead-schema";
import { cashExpenses } from "@/db/cash-schema";
import { cashAvailable } from "@/modules/cash/integration";
import { sales, saleOrders, saleLines } from "@/db/sales-schema";
import { auditEvents } from "@/db/business-schema";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { requireOperationalContext } from "@/modules/branches/context";
import type { OperationalContext } from "@/modules/operations/types";
import { decimal, integer } from "@/modules/inventory/decimal";
import { businessDate } from "@/modules/operations/business-date";
import { summarizeExpenses } from "./calculation";
import {
  type AutomaticExpenseEntry,
  type ExpenseEntry,
  type OverheadBasis,
  isAutomaticExpense,
} from "./types";
import {
  expenseMonth,
  expenseEntrySchema,
  expenseCommandSchema,
  ExpenseValidationError,
} from "./validation";
import type { z } from "zod";
export { expenseMonth } from "./validation";

const forbidden = () => {
  throw new AppError(
    "FORBIDDEN",
    "Solo el encargado puede consultar y administrar los gastos del negocio.",
    403,
  );
};
const conflict = () => {
  throw new AppError(
    "EXPENSE_CONFLICT",
    "Este mes cambió. Actualizá los datos antes de continuar.",
    409,
  );
};
const invalid = (message: string): never => {
  throw new AppError("VALIDATION", message, 400);
};
const canonicalEntries = (
  entries: z.infer<typeof expenseEntrySchema>[],
): ExpenseEntry[] =>
  entries.map((e) => ({
    ...e,
    budget: decimal(e.budget, 2, false),
    actual: decimal(e.actual, 2, false),
  }));
function bounds(month: string) {
  const [y, m] = expenseMonth.parse(month).split("-").map(Number);
  return {
    start: `${month}-01`,
    end: `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`,
  };
}
/** Daily records contribute actuals once; budgets remain exclusively manual. */
async function dailyExpenses(
  tx: Tx,
  branchId: string,
  month: string,
): Promise<AutomaticExpenseEntry[]> {
  if (!(await cashAvailable(tx))) return [];
  const { start, end } = bounds(month);
  const rows = await tx
    .select()
    .from(cashExpenses)
    .where(
      and(
        eq(cashExpenses.branchId, branchId),
        gte(cashExpenses.businessDate, start),
        lt(cashExpenses.businessDate, end),
      ),
    )
    .orderBy(
      cashExpenses.businessDate,
      cashExpenses.createdAt,
      cashExpenses.id,
    );
  return rows.map((row) => ({
    source: "cash",
    sourceId: row.id,
    businessDate: row.businessDate,
    fundingSource: row.source as AutomaticExpenseEntry["fundingSource"],
    category: row.category as ExpenseEntry["category"],
    concept: row.concept,
    budget: "0.00",
    actual: row.amount,
    notes: "",
  }));
}
export async function finalUnits(
  tx: Tx,
  branchId: string,
  month: string,
): Promise<number> {
  const { start, end } = bounds(month);
  const [row] = await tx
    .select({
      units: sql<string>`coalesce(sum(${saleLines.quantity}),0)::text`,
    })
    .from(sales)
    .innerJoin(saleOrders, eq(saleOrders.saleId, sales.id))
    .innerJoin(saleLines, eq(saleLines.orderId, saleOrders.id))
    .where(
      and(
        eq(sales.branchId, branchId),
        eq(sales.status, "closed"),
        gte(sales.businessDate, start),
        lt(sales.businessDate, end),
        ne(saleLines.lineKind, "combo"),
      ),
    );
  const units = Number(row.units);
  if (!Number.isSafeInteger(units) || units > 1000000000)
    invalid("El volumen vendido excede el límite de este análisis.");
  return units;
}
/** Called only inside an authorized financial read; no query for normal catalog requests. */
export async function budgetBasis(
  tx: Tx,
  branchId: string,
  month: string,
): Promise<OverheadBasis> {
  const [period] = await tx
    .select()
    .from(expensePeriods)
    .where(
      and(
        eq(expensePeriods.branchId, branchId),
        eq(expensePeriods.month, bounds(month).start),
      ),
    );
  const summary = summarizeExpenses(
    period?.entries ?? [],
    period?.expectedUnits ?? null,
    0,
  );
  return {
    month,
    expectedUnits: period?.expectedUnits ?? null,
    iibbRate: period?.iibbRate ?? null,
    entries:
      period?.entries.map(({ category, concept, budget }) => ({
        category,
        concept,
        budget,
      })) ?? [],
    budgetTotal:
      period?.entries.length && !summary.budgetPending
        ? summary.budgetTotal
        : null,
  };
}
export async function getExpenses(db: AppDb, actor: Actor, rawMonth?: string) {
  const ctx = await requireOperationalContext(db, actor, actor.branchId ?? "");
  if (ctx.role === "staff") forbidden();
  return db.transaction(
    async (tx) => {
      const month = expenseMonth.parse(
        rawMonth ?? businessDate(new Date(), ctx.timeZone).slice(0, 7),
      );
      const [period] = await tx
        .select()
        .from(expensePeriods)
        .where(
          and(
            eq(expensePeriods.branchId, ctx.branchId),
            eq(expensePeriods.month, bounds(month).start),
          ),
        );
      const actualUnits = await finalUnits(tx, ctx.branchId, month);
      const closures = period
        ? await tx
            .select({
              ...getTableColumns(expenseClosures),
              actorName: user.name,
            })
            .from(expenseClosures)
            .leftJoin(user, eq(user.id, expenseClosures.actorId))
            .where(eq(expenseClosures.periodId, period.id))
            .orderBy(desc(expenseClosures.sequence))
        : [];
      const automaticEntries =
        period?.status === "closed"
          ? (closures[0]?.entries ?? []).filter(isAutomaticExpense)
          : await dailyExpenses(tx, ctx.branchId, month);
      const summaryEntries = [...(period?.entries ?? []), ...automaticEntries];
      return {
        month,
        branchId: ctx.branchId,
        timeZone: ctx.timeZone,
        period: period ?? null,
        actualUnits,
        automaticEntries,
        summary: summarizeExpenses(
          summaryEntries,
          period?.expectedUnits ?? null,
          actualUnits,
        ),
        closures: closures.map((c) => ({
          ...c,
          summary: summarizeExpenses(c.entries, c.expectedUnits, c.actualUnits),
        })),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
/** executeCommand provides transaction, effective authorization and idempotent retries. */
export async function expenseCommand(
  tx: Tx,
  ctx: OperationalContext,
  operationId: string,
  raw: unknown,
) {
  if (ctx.role === "staff") forbidden();
  const validation = expenseCommandSchema.safeParse(raw);
  if (!validation.success) throw new ExpenseValidationError(validation.error);
  const input = validation.data,
    month = bounds(input.month).start;
  // Serialize even first creation: no existing row yet to lock.
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`expenses:${ctx.branchId}:${month}`}))`,
  );
  const [before] = await tx
    .select()
    .from(expensePeriods)
    .where(
      and(
        eq(expensePeriods.branchId, ctx.branchId),
        eq(expensePeriods.month, month),
      ),
    )
    .for("update");
  if ((before?.revision ?? 0) !== input.revision) conflict();
  if (input.action === "save" && before?.status === "closed") conflict();
  if (input.action === "close" && (!before || before.status === "closed"))
    conflict();
  if (input.action === "revise" && (!before || before.status !== "closed"))
    conflict();
  if (
    input.action !== "close" &&
    (!input.entries || input.expectedUnits === undefined)
  )
    invalid("Completá los gastos y las unidades previstas del mes.");
  const entries =
    input.action === "close"
      ? before!.entries
      : canonicalEntries(input.entries!);
  const expectedUnits =
    input.action === "close" ? before!.expectedUnits : input.expectedUnits!;
  const iibbRate =
    input.action === "close" || input.iibbRate === undefined
      ? (before?.iibbRate ?? null)
      : decimal(input.iibbRate, 2, false);
  if (iibbRate !== null && integer(iibbRate) > 10000n)
    invalid("La alícuota estimada de IIBB debe estar entre 0 y 100%.");
  const automaticEntries =
    input.action === "save"
      ? []
      : await dailyExpenses(tx, ctx.branchId, input.month);
  const closureEntries = [...entries, ...automaticEntries];
  if (input.action !== "save") {
    if (
      !input.confirmed ||
      !closureEntries.length ||
      entries.some((e) => e.actual === null)
    )
      invalid(
        "Confirmá que todos los gastos reales estén completos, incluso los de importe cero.",
      );
    if (input.action === "revise" && !input.reason)
      invalid("Indicá el motivo de la revisión del cierre.");
  }
  const changes = {
    entries,
    expectedUnits,
    iibbRate,
    revision: input.revision + 1,
    updatedBy: ctx.actorId,
    updatedAt: new Date(),
    status: input.action === "save" ? "draft" : "closed",
  };
  const [saved] = before
    ? await tx
        .update(expensePeriods)
        .set(changes)
        .where(eq(expensePeriods.id, before.id))
        .returning()
    : await tx
        .insert(expensePeriods)
        .values({ ...changes, branchId: ctx.branchId, month })
        .returning();
  let closure = null;
  if (input.action !== "save") {
    const [last] = await tx
      .select()
      .from(expenseClosures)
      .where(eq(expenseClosures.periodId, saved.id))
      .orderBy(desc(expenseClosures.sequence))
      .limit(1);
    [closure] = await tx
      .insert(expenseClosures)
      .values({
        periodId: saved.id,
        sequence: (last?.sequence ?? 0) + 1,
        entries: closureEntries,
        expectedUnits,
        iibbRate,
        actualUnits: await finalUnits(tx, ctx.branchId, input.month),
        actorId: ctx.actorId,
        reason: input.action === "close" ? "Cierre mensual" : input.reason!,
      })
      .returning();
  }
  await tx.insert(auditEvents).values({
    actorId: ctx.actorId,
    entity: "expense-periods",
    recordId: saved.id,
    action: input.action,
    before: before ?? null,
    after: { ...saved, closure, operationId },
  });
  return saved;
}
