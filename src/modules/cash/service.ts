import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import {
  cashSessions,
  cashSettings,
  cashMovements,
  cashExpenses,
  cashPermissions,
} from "@/db/cash-schema";
import { user, operationalUsers } from "@/db/auth-schema";
import { branchMemberships } from "@/db/branch-schema";
import { auditEvents } from "@/db/business-schema";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/lib/access";
import { executeCommand } from "@/modules/operations/command";
import { businessDate } from "@/modules/operations/business-date";
import {
  cashAvailable,
  lockCashConfiguration,
  lockCashSession,
  recordCashMovement,
} from "./integration";
import { cashCommandSchema, cashSettingsCommandSchema } from "./validation";
import { getCashSnapshot, getCashSettings } from "./queries";
import { claimCashEvidence } from "./evidence";
import {
  calculateCashClose,
  cashCents,
  cashAmount,
  summarizeCash,
  reconcilePosnet,
} from "./calculation";
export { getCashSettings } from "./queries";
function fail(code: string, message: string, status = 409): never {
  throw new AppError(code, message, status);
}
export async function runCashCommand(
  db: AppDb,
  actor: Actor,
  requestId: string,
  raw: unknown,
  now = new Date(),
  verificationId?: string,
) {
  if (!(await cashAvailable(db)))
    fail("MIGRATION_REQUIRED", "Falta habilitar Caja en la base del proyecto.");
  const command = cashCommandSchema.parse(raw);
  const result = await executeCommand(
    db,
    actor,
    actor.branchId!,
    { requestId, verificationId },
    "cash",
    command,
    async (tx, ctx, operationId) => {
      const settings = await lockCashConfiguration(tx, ctx.branchId);
      let sessionId: string;
      if (command.action === "open") {
        const [open] = await tx
          .select()
          .from(cashSessions)
          .where(
            and(
              eq(cashSessions.branchId, ctx.branchId),
              eq(cashSessions.state, "open"),
            ),
          );
        if (open)
          fail("CASH_ALREADY_OPEN", "Esta sucursal ya tiene una caja abierta.");
        const [last] = await tx
          .select()
          .from(cashSessions)
          .where(
            and(
              eq(cashSessions.branchId, ctx.branchId),
              eq(cashSessions.state, "closed"),
            ),
          )
          .orderBy(desc(cashSessions.openedAt))
          .limit(1);
        if (last && command.amount !== last.fund && !command.reason)
          fail(
            "VALIDATION",
            "Explicá la diferencia con el último fondo dejado.",
            400,
          );
        const date = businessDate(now, ctx.timeZone);
        if (
          last?.businessDate === date &&
          (ctx.role === "staff" || !command.reason)
        )
          fail(
            "VALIDATION",
            "La jornada de hoy ya se cerró. Administración o el encargado deben indicar un motivo para una nueva apertura.",
            400,
          );
        if (settings)
          await tx
            .update(cashSettings)
            .set({ activatedAt: settings.activatedAt ?? now })
            .where(eq(cashSettings.branchId, ctx.branchId));
        else
          await tx.insert(cashSettings).values({
            branchId: ctx.branchId,
            activatedAt: now,
            updatedBy: ctx.actorId,
          });
        sessionId = randomUUID();
        await tx.insert(cashSessions).values({
          id: sessionId,
          branchId: ctx.branchId,
          businessDate: date,
          openingCash: command.amount,
          openingReason: command.reason,
          closeTime: settings?.closeTime ?? "23:00",
          targetFund: settings?.targetFund ?? null,
          timeZone: ctx.timeZone,
          openedBy: ctx.actorId,
          openedAt: now,
        });
        await tx.insert(cashMovements).values({
          sessionId,
          branchId: ctx.branchId,
          kind: "opening",
          amount: command.amount,
          methodKind: "cash",
          methodName: "Efectivo",
          concept: "Fondo de apertura",
          sourceType: "cash-opening",
          sourceId: sessionId,
          actorId: ctx.actorId,
          createdAt: now,
        });
      } else if (command.action === "review") {
        const [session] = await tx
          .select()
          .from(cashSessions)
          .where(
            and(
              eq(cashSessions.id, command.sessionId),
              eq(cashSessions.branchId, ctx.branchId),
            ),
          )
          .for("update");
        if (!session || session.state !== "closed")
          fail("NOT_FOUND", "No se encontró el cierre en esta sucursal.", 404);
        if (session.reviewedAt)
          fail("CONFLICT", "Este cierre ya fue revisado.");
        const posnetReview = command.posnet
          ? reconcilePosnet(
              command.posnet,
              session.posnet?.expected ?? "0.00",
              session.posnet?.expectedOperations ?? 0,
            )
          : null;
        if (posnetReview) {
          if (!session.reviewRequired || posnetReview.mode !== "registered")
            fail(
              "VALIDATION",
              "La revisión permite agregar el comprobante real de una jornada pendiente.",
              400,
            );
          await claimCashEvidence(tx, ctx, session.id, posnetReview, now);
        }
        await tx
          .update(cashSessions)
          .set({
            reviewedAt: now,
            reviewedBy: ctx.actorId,
            reviewNote: command.note,
            posnetReview,
          })
          .where(eq(cashSessions.id, session.id));
        sessionId = session.id;
      } else {
        const session = await lockCashSession(tx, ctx);
        if (!session)
          fail("CASH_CLOSED", "Abrí la caja antes de registrar movimientos.");
        sessionId = session.id;
        if (command.action === "expense") {
          if (command.source === "external" && ctx.role === "staff")
            fail(
              "FORBIDDEN",
              "Los gastos por fuera de caja los registra Administración o el encargado.",
              403,
            );
          const id = randomUUID();
          await tx.insert(cashExpenses).values({
            id,
            branchId: ctx.branchId,
            sessionId: session.id,
            businessDate: session.businessDate,
            category: command.category,
            concept: command.concept,
            amount: command.amount,
            source: command.source,
            actorId: ctx.actorId,
            createdAt: now,
          });
          if (command.source === "cash")
            await recordCashMovement(tx, ctx, {
              kind: "expense",
              amount: cashAmount(-cashCents(command.amount)),
              sourceType: "cash-expense",
              sourceId: id,
              methodKind: "cash",
              methodName: "Efectivo",
              concept: command.concept,
              occurredAt: now,
            });
        } else if (command.action === "withdraw") {
          await recordCashMovement(tx, ctx, {
            kind: "withdrawal",
            amount: cashAmount(-cashCents(command.amount)),
            sourceType: "cash-withdrawal",
            sourceId: operationId,
            methodKind: "cash",
            methodName: "Efectivo",
            concept: command.reason,
            reference: `Recibido por ${command.recipient}`,
            occurredAt: now,
          });
        } else {
          if (
            session.id !== command.sessionId ||
            session.revision !== command.expectedRevision
          )
            fail(
              "CASH_CHANGED",
              "La caja recibió nuevos movimientos. Actualizá el resumen y revisá los importes antes de cerrar.",
            );
          if (ctx.role === "staff" && cashCents(command.withdrawal) > 0n)
            fail(
              "FORBIDDEN",
              "El retiro de efectivo requiere permiso de encargado.",
              403,
            );
          const movements = await tx
            .select()
            .from(cashMovements)
            .where(eq(cashMovements.sessionId, session.id));
          const totals = summarizeCash(movements),
            calculated = calculateCashClose(
              totals.expectedCash,
              command.counted,
              command.withdrawal,
            );
          if (calculated.difference !== "0.00" && !command.reason)
            fail(
              "VALIDATION",
              "Indicá el motivo del faltante o sobrante para cerrar.",
              400,
            );
          const posnet = reconcilePosnet(
            command.posnet,
            totals.cardTotal,
            totals.cardOperations,
          );
          await claimCashEvidence(tx, ctx, session.id, posnet, now);
          // The close withdrawal uses the physical count, including any declared discrepancy.
          if (cashCents(command.withdrawal) > 0n)
            await tx.insert(cashMovements).values({
              sessionId: session.id,
              branchId: ctx.branchId,
              kind: "withdrawal",
              amount: cashAmount(-cashCents(command.withdrawal)),
              methodKind: "cash",
              methodName: "Efectivo",
              concept: "Retiro al cerrar",
              reference: `Recibido por ${ctx.actorId}`,
              sourceType: "cash-close-withdrawal",
              sourceId: session.id,
              actorId: ctx.actorId,
              createdAt: now,
            });
          const reviewRequired =
            calculated.difference !== "0.00" || posnet.needsReview;
          await tx
            .update(cashSessions)
            .set({
              state: "closed",
              closedAt: now,
              closedBy: ctx.actorId,
              expectedClosing: totals.expectedCash,
              counted: command.counted,
              withdrawal: command.withdrawal,
              fund: calculated.fund,
              difference: calculated.difference,
              reason: command.reason,
              posnet,
              reviewRequired,
              reviewedAt: reviewRequired ? null : now,
              reviewedBy: reviewRequired ? null : ctx.actorId,
              revision: session.revision + 1,
            })
            .where(eq(cashSessions.id, session.id));
        }
      }
      await tx.insert(auditEvents).values({
        actorId: ctx.actorId,
        entity: "cash",
        recordId: sessionId,
        action: command.action,
        after: { operationId, command },
      });
      return { sessionId };
    },
  );
  return getCashSnapshot(db, actor, result.result.sessionId);
}
export async function runCashSettingsCommand(
  db: AppDb,
  actor: Actor,
  requestId: string,
  raw: unknown,
) {
  if (!(await cashAvailable(db)))
    fail("MIGRATION_REQUIRED", "Falta habilitar Caja en la base del proyecto.");
  const command = cashSettingsCommandSchema.parse(raw);
  await executeCommand(
    db,
    actor,
    actor.branchId!,
    { requestId },
    "cash-settings",
    command,
    async (tx, ctx, operationId) => {
      const settings = await lockCashConfiguration(tx, ctx.branchId);
      if (command.action === "configure") {
        if ((settings?.revision ?? 0) !== command.revision)
          fail(
            "CONFLICT",
            "La configuración cambió. Actualizala antes de guardar.",
          );
        const values = {
          closeTime: command.closeTime,
          targetFund: command.targetFund,
          revision: command.revision + 1,
          updatedBy: ctx.actorId,
          updatedAt: new Date(),
        };
        if (settings)
          await tx
            .update(cashSettings)
            .set(values)
            .where(eq(cashSettings.branchId, ctx.branchId));
        else
          await tx
            .insert(cashSettings)
            .values({ ...values, branchId: ctx.branchId });
      } else {
        const [employee] = await tx
          .select({ id: user.id })
          .from(branchMemberships)
          .innerJoin(
            operationalUsers,
            eq(operationalUsers.userId, branchMemberships.userId),
          )
          .innerJoin(user, eq(user.id, branchMemberships.userId))
          .where(
            and(
              eq(branchMemberships.branchId, ctx.branchId),
              eq(branchMemberships.userId, command.userId),
              isNull(branchMemberships.revokedAt),
              eq(operationalUsers.disabled, false),
            ),
          )
          .for("share");
        if (!employee)
          fail(
            "FORBIDDEN",
            "Elegí una persona activa con acceso a esta sucursal.",
            403,
          );
        const values = {
          canOpen: command.canOpen,
          canClose: command.canClose,
          canExpense: command.canExpense,
          updatedBy: ctx.actorId,
          updatedAt: new Date(),
        };
        await tx
          .insert(cashPermissions)
          .values({ ...values, branchId: ctx.branchId, userId: command.userId })
          .onConflictDoUpdate({
            target: [cashPermissions.branchId, cashPermissions.userId],
            set: values,
          });
      }
      await tx.insert(auditEvents).values({
        actorId: ctx.actorId,
        entity: "cash-settings",
        recordId: ctx.branchId,
        action: command.action,
        after: { operationId, command },
      });
      return { saved: true };
    },
  );
  return getCashSettings(db, actor);
}
