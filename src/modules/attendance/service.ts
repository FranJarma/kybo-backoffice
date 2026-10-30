import { randomInt, randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import {
  requireOperationalContext,
  requireAdministrator,
} from "@/modules/branches/context";
import {
  attendanceEvents,
  attendanceManualRequests,
  attendanceOperations,
  attendanceSettings,
  attendanceAssignments,
  attendanceCorrections,
} from "@/db/attendance-schema";
import { auditEvents } from "@/db/business-schema";
import { consumeConfirmation, lockIdentity } from "@/modules/identity/service";
import {
  canonicalHash,
  hashCode,
  sealCode,
  codeMatches,
} from "@/modules/identity/crypto";
import { scheduleInstant } from "@/modules/production/schedule-time";
import { attendanceCommandSchema } from "./validation";
import { evaluateLocation } from "./rules";
import { requireAttendanceManager, requireParticipant } from "./access";
import { prepareEvents } from "./events";
import { runSchedulingCommand } from "./scheduling";
import { consumeAttendanceQrAttempt } from "./qr";
type Result = { id: string; replayed?: boolean; [key: string]: unknown };
export async function runAttendanceCommand(
  db: AppDb,
  actor: Actor,
  requestId: string,
  raw: unknown,
  now = new Date(),
): Promise<Result> {
  z.uuid().parse(requestId);
  const command = attendanceCommandSchema.parse(raw);
  const intent: Record<string, unknown> = { ...command };
  delete intent.verificationId;
  if (command.action === "redeemManual") delete intent.code;
  const businessIntent = { ...intent };
  if (command.action === "punch") delete businessIntent.location;
  const fingerprint = canonicalHash({
    actorId: actor.id,
    branchId: actor.branchId,
    command: businessIntent,
  });
  const result = await db.transaction(async (tx) => {
    let ctx = await requireOperationalContext(tx, actor, actor.branchId ?? "");
    if (ctx.accountKind === "store")
      throw new AppError(
        "ATTENDANCE_PERSONAL_ACCOUNT",
        "La cuenta del local no puede registrar asistencia personal. Autorizá la gestión para solicitar una excepción.",
        403,
      );
    const ownCorrection =
      command.action === "requestCorrection" && command.userId === actor.id;
    if (command.action !== "punch" && !ownCorrection)
      requireAttendanceManager(ctx);
    if (command.action === "configure" || command.action === "participant")
      await requireAdministrator(tx, actor);
    const [policy] = await tx
      .select()
      .from(attendanceSettings)
      .where(eq(attendanceSettings.branchId, ctx.branchId))
      .for("update");
    if (!policy && command.action !== "configure")
      throw new AppError(
        "ATTENDANCE_NOT_CONFIGURED",
        "Administración debe configurar Asistencia en esta sucursal.",
        409,
      );
    if (
      ["punch", "requestManual", "redeemManual"].includes(command.action) &&
      !policy?.enabled
    )
      throw new AppError(
        "ATTENDANCE_DISABLED",
        "El fichaje todavía no está habilitado en esta sucursal.",
        409,
      );
    const manualResolution =
      command.action === "approveManual" ||
      command.action === "rejectManual" ||
      command.action === "redeemManual";
    const initialRequest =
      manualResolution && "id" in command
        ? (
            await tx
              .select()
              .from(attendanceManualRequests)
              .where(eq(attendanceManualRequests.id, command.id!))
          )[0]
        : null;
    if (
      manualResolution &&
      (!initialRequest || initialRequest.branchId !== ctx.branchId)
    )
      throw new AppError("NOT_FOUND", "La solicitud no está disponible.", 404);
    let subjectId =
      "userId" in command
        ? command.userId
        : (initialRequest?.userId ?? actor.id);
    if (command.action === "resolveCorrection") {
      const [row] = await tx
        .select()
        .from(attendanceCorrections)
        .where(eq(attendanceCorrections.id, command.id));
      if (!row || row.branchId !== ctx.branchId)
        throw new AppError(
          "NOT_FOUND",
          "La solicitud no está disponible.",
          404,
        );
      subjectId = row.userId;
    }
    if (command.action === "cancelAssignment") {
      const [row] = await tx
        .select()
        .from(attendanceAssignments)
        .where(eq(attendanceAssignments.id, command.id));
      if (!row || row.branchId !== ctx.branchId)
        throw new AppError("NOT_FOUND", "El horario no está disponible.", 404);
      subjectId = row.userId;
    }
    if (command.action === "linkAssignment") {
      const [row] = await tx
        .select()
        .from(attendanceEvents)
        .where(eq(attendanceEvents.id, command.entryId));
      if (!row || row.branchId !== ctx.branchId)
        throw new AppError("NOT_FOUND", "La entrada no está disponible.", 404);
      subjectId = row.userId;
    }
    const copyUsers =
      command.action === "copyWeek"
        ? (
            await tx
              .select({ userId: attendanceAssignments.userId })
              .from(attendanceAssignments)
              .where(eq(attendanceAssignments.branchId, ctx.branchId))
          )
            .filter(
              (r) => !command.userIds || command.userIds.includes(r.userId),
            )
            .map((r) => r.userId)
        : [];
    for (const id of [...new Set([actor.id, subjectId, ...copyUsers])].sort())
      await lockIdentity(tx, id);
    ctx = await requireOperationalContext(tx, actor, ctx.branchId);
    if (command.action !== "punch" && !ownCorrection)
      requireAttendanceManager(ctx);
    if (
      ["punch", "requestManual", "redeemManual", "assign"].includes(
        command.action,
      )
    )
      await requireParticipant(tx, ctx.branchId, subjectId);
    if (command.action === "approveManual" || command.action === "rejectManual")
      await requireAdministrator(tx, actor);
    if (
      command.action === "redeemManual" &&
      initialRequest!.requestedBy !== actor.id
    )
      throw new AppError(
        "FORBIDDEN",
        "Solo quien solicitó esta excepción puede registrar el fichaje autorizado.",
        403,
      );
    const [previous] = await tx
      .select()
      .from(attendanceOperations)
      .where(eq(attendanceOperations.requestId, requestId));
    if (previous) {
      if (
        previous.actorId !== actor.id ||
        previous.branchId !== ctx.branchId ||
        previous.fingerprint !== fingerprint
      )
        throw new AppError(
          "IDEMPOTENCY_CONFLICT",
          "La clave corresponde a otra operación.",
          409,
        );
      return { ...previous.result, replayed: true } as Result;
    }
    let response: Result;
    if (command.action === "punch") {
      const qr = await consumeAttendanceQrAttempt(
        tx,
        actor,
        command.qrAttemptId,
        requestId,
        policy!.revision,
        now,
      );
      const evidence = evaluateLocation(policy!, command.location, now);
      const prepared = await prepareEvents(
        tx,
        ctx,
        actor.id,
        command.kind,
        now,
        command.assignmentId,
      );
      const proof = await consumeConfirmation(
        tx,
        actor,
        {
          action: "attendance-punch",
          branchId: ctx.branchId,
          requestId,
          payload: intent,
        },
        command.verificationId,
        now,
      );
      await tx.insert(attendanceEvents).values(
        prepared.additions.map((e) => ({
          id: e.id,
          branchId: ctx.branchId,
          userId: actor.id,
          kind: e.kind,
          occurredAt: now,
          recordedAt: now,
          ...prepared.reference,
          source: "phone" as const,
          credentialId: proof.credentialId,
          evidence: { ...evidence, proofId: proof.proofId, qrAttemptId: qr.id },
          recordedBy: actor.id,
        })),
      );
      response = {
        id: prepared.additions.at(-1)!.id,
        occurredAt: now.toISOString(),
      };
    } else if (command.action === "requestManual") {
      const occurredAt = new Date(
        scheduleInstant(command.localTime, ctx.timeZone),
      );
      if (occurredAt > now)
        throw new AppError(
          "ATTENDANCE_FUTURE",
          "El fichaje informado no puede estar en el futuro.",
          400,
        );
      const prepared = await prepareEvents(
        tx,
        ctx,
        command.userId,
        command.kind,
        occurredAt,
        command.assignmentId,
        true,
      );
      const id = randomUUID();
      await tx.insert(attendanceManualRequests).values({
        id,
        branchId: ctx.branchId,
        userId: command.userId,
        kind: command.kind,
        occurredAt,
        assignmentId: prepared.reference.assignmentId,
        reason: command.reason,
        requestedBy: actor.id,
        requestedAt: now,
      });
      response = { id, status: "pending" };
    } else if (
      command.action === "approveManual" ||
      command.action === "rejectManual" ||
      command.action === "redeemManual"
    ) {
      const [request] = await tx
        .select()
        .from(attendanceManualRequests)
        .where(eq(attendanceManualRequests.id, command.id))
        .for("update");
      if (
        command.action === "approveManual" ||
        command.action === "rejectManual"
      ) {
        if (request.status !== "pending")
          throw new AppError(
            "ATTENDANCE_RESOLVED",
            "Esta solicitud ya fue resuelta.",
            409,
          );
        if (request.requestedBy === actor.id)
          throw new AppError(
            "FORBIDDEN",
            "La solicitud debe aprobarla otro usuario administrador.",
            403,
          );
        if (command.action === "approveManual") {
          const code = String(randomInt(100000, 1000000));
          const secret = process.env.BETTER_AUTH_SECRET ?? "";
          await tx
            .update(attendanceManualRequests)
            .set({
              status: "approved",
              approvedBy: actor.id,
              decidedAt: now,
              decisionReason: command.reason,
              validityMinutes: policy!.codeValidityMinutes,
              expiresAt: new Date(
                now.getTime() + policy!.codeValidityMinutes * 60000,
              ),
              codeHash: hashCode(code, request.id, secret),
              codeCipher: sealCode(code, request.id, secret),
            })
            .where(eq(attendanceManualRequests.id, request.id));
          response = { id: request.id, status: "approved" };
        } else {
          await tx
            .update(attendanceManualRequests)
            .set({
              status: "rejected",
              approvedBy: actor.id,
              decidedAt: now,
              decisionReason: command.reason,
            })
            .where(eq(attendanceManualRequests.id, request.id));
          response = { id: request.id, status: "rejected" };
        }
      } else {
        if (
          request.status !== "approved" ||
          !request.expiresAt ||
          request.expiresAt <= now ||
          request.failedAttempts >= 5
        )
          throw new AppError(
            "ATTENDANCE_CODE_UNAVAILABLE",
            "El código venció, ya fue utilizado o quedó bloqueado. Solicitá una nueva autorización.",
            409,
          );
        if (
          !codeMatches(
            command.code,
            request.id,
            request.codeHash!,
            process.env.BETTER_AUTH_SECRET ?? "",
          )
        ) {
          const failedAttempts = request.failedAttempts + 1;
          await tx
            .update(attendanceManualRequests)
            .set({
              failedAttempts,
              ...(failedAttempts >= 5
                ? {
                    status: "locked" as const,
                    codeHash: null,
                    codeCipher: null,
                  }
                : {}),
            })
            .where(eq(attendanceManualRequests.id, request.id));
          return {
            failure: new AppError(
              "ATTENDANCE_CODE_INVALID",
              failedAttempts >= 5
                ? "Se agotaron los intentos. Solicitá una nueva autorización."
                : "El código no coincide. Revisalo y volvé a intentar.",
              409,
            ),
          };
        }
        const prepared = await prepareEvents(
          tx,
          ctx,
          request.userId,
          request.kind,
          request.occurredAt,
          request.assignmentId,
        );
        await tx.insert(attendanceEvents).values(
          prepared.additions.map((e) => ({
            id: e.id,
            branchId: ctx.branchId,
            userId: request.userId,
            kind: e.kind,
            occurredAt: request.occurredAt,
            recordedAt: now,
            ...prepared.reference,
            source: "manual" as const,
            manualRequestId: request.id,
            recordedBy: actor.id,
          })),
        );
        await tx
          .update(attendanceManualRequests)
          .set({
            status: "used",
            usedAt: now,
            usedBy: actor.id,
            codeHash: null,
            codeCipher: null,
          })
          .where(eq(attendanceManualRequests.id, request.id));
        response = {
          id: prepared.additions.at(-1)!.id,
          manualRequestId: request.id,
          status: "used",
        };
      }
    } else response = await runSchedulingCommand(tx, ctx, command, now);
    await tx.insert(attendanceOperations).values({
      requestId,
      actorId: actor.id,
      branchId: ctx.branchId,
      fingerprint,
      result: response,
      createdAt: now,
    });
    await tx.insert(auditEvents).values({
      actorId: actor.id,
      entity: "attendance",
      recordId: String(response.id),
      action: command.action,
      after: {
        ...response,
        branchId: ctx.branchId,
        userId: subjectId,
        requestId,
      },
      createdAt: now,
    });
    return response;
  });
  if ("failure" in result && result.failure instanceof AppError)
    throw result.failure;
  return result as Result;
}
