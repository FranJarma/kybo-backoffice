import {
  and,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import {
  cashSessions,
  cashSettings,
  cashMovements,
  cashPermissions,
} from "@/db/cash-schema";
import { branches, branchMemberships } from "@/db/branch-schema";
import { user, operationalUsers } from "@/db/auth-schema";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { requireOperationalContext } from "@/modules/branches/context";
import { cashAvailable } from "./integration";
import { authorizeCashRead, cashCapabilities } from "./access";
import { summarizeCash } from "./calculation";
import type {
  CashSession,
  CashSnapshot,
  CashSettingsSnapshot,
  CashStatus,
} from "./types";
const opener = alias(user, "cash_opener"),
  closer = alias(user, "cash_closer"),
  reviewer = alias(user, "cash_reviewer");
async function sessions(
  tx: Tx,
  branchId: string,
  id?: string,
): Promise<CashSession[]> {
  const query = tx
    .select({
      ...getTableColumns(cashSessions),
      openedByName: opener.name,
      closedByName: closer.name,
      reviewedByName: reviewer.name,
    })
    .from(cashSessions)
    .leftJoin(opener, eq(opener.id, cashSessions.openedBy))
    .leftJoin(closer, eq(closer.id, cashSessions.closedBy))
    .leftJoin(reviewer, eq(reviewer.id, cashSessions.reviewedBy))
    .where(
      and(
        eq(cashSessions.branchId, branchId),
        id
          ? eq(cashSessions.id, id)
          : or(
              and(
                eq(cashSessions.reviewRequired, true),
                isNull(cashSessions.reviewedAt),
              ),
              inArray(
                cashSessions.id,
                tx
                  .select({ id: cashSessions.id })
                  .from(cashSessions)
                  .where(eq(cashSessions.branchId, branchId))
                  .orderBy(desc(cashSessions.openedAt))
                  .limit(60),
              ),
            ),
      ),
    )
    .orderBy(desc(cashSessions.openedAt));
  const rows = id ? await query.limit(1) : await query;
  return rows.map((row) => ({
    ...row,
    openedByName: row.openedByName ?? "Usuario",
    openedAt: row.openedAt.toISOString(),
    closedAt: row.closedAt?.toISOString() ?? null,
    reviewedAt: row.reviewedAt?.toISOString() ?? null,
  }));
}
export async function getCashSnapshot(
  db: AppDb,
  actor: Actor,
  sessionId?: string,
): Promise<CashSnapshot> {
  return db.transaction(
    async (tx) => {
      const ctx = await requireOperationalContext(
        tx,
        actor,
        actor.branchId ?? "",
      );
      const [branch] = await tx
        .select({ name: branches.name })
        .from(branches)
        .where(eq(branches.id, ctx.branchId));
      const available = await cashAvailable(tx);
      const base = {
        available,
        activated: false,
        branchId: ctx.branchId,
        branchName: branch.name,
        timeZone: ctx.timeZone,
        capabilities: {
          open: ctx.role !== "staff",
          close: ctx.role !== "staff",
          expense: ctx.role !== "staff",
          externalExpense: ctx.role !== "staff",
          withdraw: ctx.role !== "staff",
          supplier: ctx.role !== "staff",
          review: ctx.role !== "staff",
          admin: ctx.role === "admin",
        },
        settings: { closeTime: "23:00", targetFund: null, revision: 0 },
        current: null,
        selected: null,
        lastClosed: null,
        sessions: [],
        movements: [],
        totals: summarizeCash([]),
        pendingReviews: 0,
      } satisfies CashSnapshot;
      if (!available) return base;
      const capabilities = await authorizeCashRead(tx, ctx);
      const [settings] = await tx
        .select()
        .from(cashSettings)
        .where(eq(cashSettings.branchId, ctx.branchId));
      const history = await sessions(tx, ctx.branchId);
      const current = history.find((row) => row.state === "open") ?? null;
      const lastClosed = history.find((row) => row.state === "closed") ?? null;
      const selected = sessionId
        ? (history.find((row) => row.id === sessionId) ??
          (await sessions(tx, ctx.branchId, sessionId))[0] ??
          null)
        : (current ?? lastClosed);
      if (sessionId && !selected)
        throw new AppError(
          "NOT_FOUND",
          "No se encontró la jornada en esta sucursal.",
          404,
        );
      const rows = selected
        ? await tx
            .select({
              id: cashMovements.id,
              sessionId: cashMovements.sessionId,
              branchId: cashMovements.branchId,
              kind: cashMovements.kind,
              amount: cashMovements.amount,
              methodKind: cashMovements.methodKind,
              methodName: cashMovements.methodName,
              concept: cashMovements.concept,
              reference: cashMovements.reference,
              sourceType: cashMovements.sourceType,
              sourceId: cashMovements.sourceId,
              actorName: user.name,
              createdAt: cashMovements.createdAt,
            })
            .from(cashMovements)
            .innerJoin(user, eq(user.id, cashMovements.actorId))
            .where(
              and(
                eq(cashMovements.branchId, ctx.branchId),
                eq(cashMovements.sessionId, selected.id),
              ),
            )
            .orderBy(desc(cashMovements.createdAt))
        : [];
      const [pending] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(cashSessions)
        .where(
          and(
            eq(cashSessions.branchId, ctx.branchId),
            eq(cashSessions.reviewRequired, true),
            isNull(cashSessions.reviewedAt),
          ),
        );
      return {
        ...base,
        activated: !!settings?.activatedAt,
        capabilities,
        settings: {
          closeTime: settings?.closeTime ?? "23:00",
          targetFund: settings?.targetFund ?? null,
          revision: settings?.revision ?? 0,
        },
        current,
        selected,
        lastClosed,
        sessions: history,
        movements: rows.map((row) => ({
          ...row,
          createdAt: row.createdAt.toISOString(),
        })),
        totals: summarizeCash(rows),
        pendingReviews: pending.count,
      };
    },
    { isolationLevel: "repeatable read" },
  );
}
export async function getCashStatus(
  db: AppDb,
  actor: Actor,
): Promise<CashStatus> {
  return db.transaction(async (tx) => {
    const ctx = await requireOperationalContext(
      tx,
      actor,
      actor.branchId ?? "",
    );
    if (!(await cashAvailable(tx)))
      return {
        actorId: ctx.actorId,
        available: false,
        activated: false,
        branchId: ctx.branchId,
        timeZone: ctx.timeZone,
        open: false,
        sessionId: null,
        canOpen: false,
        canView: false,
        opening: null,
      };
    const [settings] = await tx
      .select()
      .from(cashSettings)
      .where(eq(cashSettings.branchId, ctx.branchId));
    const capabilities = await cashCapabilities(tx, ctx);
    const canView =
      capabilities.open || capabilities.close || capabilities.expense;
    const [current] = await tx
      .select({
        id: cashSessions.id,
        openedAt: cashSessions.openedAt,
        openingCash: cashSessions.openingCash,
        openedByName: user.name,
        timeZone: cashSessions.timeZone,
      })
      .from(cashSessions)
      .innerJoin(user, eq(user.id, cashSessions.openedBy))
      .where(
        and(
          eq(cashSessions.branchId, ctx.branchId),
          eq(cashSessions.state, "open"),
        ),
      );
    return {
      actorId: ctx.actorId,
      available: true,
      activated: !!settings?.activatedAt,
      branchId: ctx.branchId,
      timeZone: current?.timeZone ?? ctx.timeZone,
      open: !!current,
      sessionId: current?.id ?? null,
      canOpen: capabilities.open,
      canView,
      opening:
        canView && current
          ? {
              openedByName: current.openedByName,
              openedAt: current.openedAt.toISOString(),
              openingCash: current.openingCash,
            }
          : null,
    };
  });
}
export async function getCashSettings(
  db: AppDb,
  actor: Actor,
): Promise<CashSettingsSnapshot> {
  return db.transaction(async (tx) => {
    const ctx = await requireOperationalContext(
      tx,
      actor,
      actor.branchId ?? "",
    );
    if (ctx.role !== "admin")
      throw new AppError(
        "FORBIDDEN",
        "Solo Administración puede configurar Caja.",
        403,
      );
    const [branch] = await tx
      .select()
      .from(branches)
      .where(eq(branches.id, ctx.branchId));
    if (!(await cashAvailable(tx)))
      return {
        available: false,
        branchId: ctx.branchId,
        branchName: branch.name,
        settings: { closeTime: "23:00", targetFund: null, revision: 0 },
        employees: [],
      };
    const [settings] = await tx
      .select()
      .from(cashSettings)
      .where(eq(cashSettings.branchId, ctx.branchId));
    const employees = await tx
      .select({
        id: user.id,
        name: user.name,
        role: branchMemberships.role,
        canOpen: cashPermissions.canOpen,
        canClose: cashPermissions.canClose,
        canExpense: cashPermissions.canExpense,
      })
      .from(branchMemberships)
      .innerJoin(user, eq(user.id, branchMemberships.userId))
      .innerJoin(operationalUsers, eq(operationalUsers.userId, user.id))
      .leftJoin(
        cashPermissions,
        and(
          eq(cashPermissions.userId, user.id),
          eq(cashPermissions.branchId, ctx.branchId),
        ),
      )
      .where(
        and(
          eq(branchMemberships.branchId, ctx.branchId),
          isNull(branchMemberships.revokedAt),
          eq(operationalUsers.disabled, false),
        ),
      );
    return {
      available: true,
      branchId: ctx.branchId,
      branchName: branch.name,
      settings: {
        closeTime: settings?.closeTime ?? "23:00",
        targetFund: settings?.targetFund ?? null,
        revision: settings?.revision ?? 0,
      },
      employees: employees.map((row) => ({
        ...row,
        canOpen: row.role === "manager" || !!row.canOpen,
        canClose: row.role === "manager" || !!row.canClose,
        canExpense: row.role === "manager" || !!row.canExpense,
      })),
    };
  });
}
