import { createHash, createHmac, randomUUID } from "node:crypto";
import { and, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { Actor } from "@/lib/access";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import {
  printJobs,
  printTickets,
  printingConnectors,
  printingPairings,
  printingRequests,
  printingSettings,
} from "@/db/printing-schema";
import { branches } from "@/db/branch-schema";
import { user } from "@/db/auth-schema";
import { locatorAssignments } from "@/db/pickup-schema";
import {
  requireAdministrator,
  requireOperationalContext,
} from "@/modules/branches/context";
import { printingAvailable } from "./availability";
import { printingCommand } from "./validation";
import { ticketDocument } from "./document";
import { getJobForUpdate, printError } from "./jobs";
import { audit } from "@/modules/inventory/service";
import type {
  PrintingSnapshot,
  PrintState,
  PrintTicket,
  TicketKind,
} from "./types";
export const printHash = (text: string) =>
  createHash("sha256").update(text).digest("hex");
function pairingCode(branchId: string, actorId: string, requestId: string) {
  const key = process.env.BETTER_AUTH_SECRET;
  if (!key || key.length < 24)
    printError("Falta la configuración segura para vincular el conector.", 503);
  return createHmac("sha256", key)
    .update(`kybo-print-pair-v1|${branchId}|${actorId}|${requestId}`)
    .digest("hex");
}
export async function getPrintingSnapshot(
  db: AppDb,
  actor: Actor,
  saleId?: string,
): Promise<PrintingSnapshot> {
  return db.transaction(async (tx) => {
    const ctx = await requireOperationalContext(
      tx,
      actor,
      actor.branchId ?? "",
    );
    const capabilities = {
      canConfigure: ctx.role === "admin" && ctx.accountKind !== "store",
      canManage: ctx.role !== "staff" && ctx.accountKind !== "store",
    };
    if (!(await printingAvailable(tx)))
      return {
        ready: false,
        ...capabilities,
        settings: null,
        connector: null,
        jobs: [],
        message:
          "La impresión todavía no está habilitada. Administración debe completar la activación.",
      };
    if (!saleId && !capabilities.canManage)
      printError("Abrí el pedido para consultar sus tickets.", 403);
    if (saleId) z.uuid().parse(saleId);
    const [settings] = await tx
      .select()
      .from(printingSettings)
      .where(eq(printingSettings.branchId, ctx.branchId));
    const [connector] = await tx
      .select()
      .from(printingConnectors)
      .where(
        and(
          eq(printingConnectors.branchId, ctx.branchId),
          isNull(printingConnectors.revokedAt),
        ),
      );
    const rows = await tx
      .select({
        job: printJobs,
        ticket: printTickets,
        requesterName: user.name,
      })
      .from(printJobs)
      .innerJoin(printTickets, eq(printTickets.id, printJobs.ticketId))
      .leftJoin(user, eq(user.id, printJobs.requestedBy))
      .where(
        and(
          eq(printJobs.branchId, ctx.branchId),
          saleId
            ? sql`${printTickets.snapshot}->>'saleId' = ${saleId}`
            : undefined,
        ),
      )
      .orderBy(desc(printJobs.createdAt), desc(printJobs.id))
      .limit(100);
    return {
      ready: true,
      ...capabilities,
      settings: settings
        ? {
            enabled: settings.enabled,
            revision: settings.revision,
            printerName: settings.printerName,
          }
        : null,
      connector: connector
        ? {
            id: connector.id,
            name: connector.name,
            connected:
              !!connector.lastSeenAt &&
              Date.now() - connector.lastSeenAt.getTime() < 20000,
            lastSeenAt: connector.lastSeenAt?.toISOString() ?? null,
            printerStatus: connector.printerStatus,
            printerMessage: connector.printerMessage,
          }
        : null,
      jobs: rows.map(({ job, ticket, requesterName }) => ({
        id: job.id,
        ticketId: ticket.id,
        saleId: ticket.snapshot.saleId,
        orderId: ticket.snapshot.orderId,
        saleNumber: ticket.snapshot.saleNumber,
        sequence: ticket.snapshot.sequence,
        stationName: ticket.snapshot.stationName,
        kind: job.kind as TicketKind,
        copyNumber: job.copyNumber,
        state: job.state as PrintState,
        createdAt: job.createdAt.toISOString(),
        sentAt: job.sentAt?.toISOString() ?? null,
        error: job.error,
        spoolState: job.spoolState,
        reason: job.reason,
        requestedBy: requesterName ?? "Operador",
        canReprint:
          ["original", "copy", "historical"].includes(job.kind) &&
          (job.kind !== "historical" || capabilities.canManage) &&
          (["sent", "uncertain"].includes(job.state) ||
            (job.state === "error" && job.reportOutcome === "failed") ||
            (capabilities.canManage && job.state === "cancelled")) &&
          job.spoolState === "removed",
        canRetry:
          capabilities.canManage &&
          ["review", "error"].includes(job.state) &&
          job.reportOutcome === null &&
          job.spoolJobId === null &&
          job.spoolState !== "present",
        document: ticketDocument(ticket.snapshot, {
          kind: job.kind as TicketKind,
          copyNumber: job.copyNumber,
          requestedAt: job.createdAt.toISOString(),
          change: job.change ?? undefined,
        }),
      })),
    };
  });
}
export async function runPrintingCommand(
  db: AppDb,
  actor: Actor,
  requestId: string,
  raw: unknown,
) {
  z.uuid().parse(requestId);
  const command = printingCommand.parse(raw);
  return db.transaction(async (tx) => {
    const ctx = await requireOperationalContext(
      tx,
      actor,
      actor.branchId ?? "",
    );
    if (!(await printingAvailable(tx)))
      printError(
        "Administración debe habilitar la impresión antes de guardar.",
        503,
      );
    const admin = ["configure", "pairing", "revoke", "test"].includes(
      command.action,
    );
    if (admin) await requireAdministrator(tx, actor);
    if (
      ["retry", "resolve"].includes(command.action) &&
      (ctx.role === "staff" || ctx.accountKind === "store")
    )
      printError("El encargado debe revisar este envío.", 403);
    // Every command is scoped and authorized before a replay can return data.
    const fingerprint = printHash(JSON.stringify(command));
    const [reservation] = await tx
      .insert(printingRequests)
      .values({
        requestId,
        branchId: ctx.branchId,
        actorId: actor.id,
        fingerprint,
        result: {},
      })
      .onConflictDoNothing()
      .returning();
    if (!reservation) {
      const [old] = await tx
        .select()
        .from(printingRequests)
        .where(eq(printingRequests.requestId, requestId));
      if (
        !old ||
        old.branchId !== ctx.branchId ||
        old.actorId !== actor.id ||
        old.fingerprint !== fingerprint
      )
        printError("La operación ya se utilizó para otros datos.");
      const stored = old.result as Record<string, unknown>;
      return command.action === "pairing"
        ? { ...stored, code: pairingCode(ctx.branchId, actor.id, requestId) }
        : stored;
    }
    let result: Record<string, unknown>;
    if (command.action === "configure") {
      const [old] = await tx
        .select()
        .from(printingSettings)
        .where(eq(printingSettings.branchId, ctx.branchId))
        .for("update");
      if ((old?.revision ?? 0) !== command.revision)
        printError("La configuración cambió. Actualizá antes de guardar.");
      if (old) {
        await tx
          .update(printingSettings)
          .set({
            enabled: command.enabled,
            printerName: command.printerName,
            revision: old.revision + 1,
            updatedBy: actor.id,
            updatedAt: sql`now()`,
          })
          .where(eq(printingSettings.branchId, ctx.branchId));
        if (old.printerName !== command.printerName) {
          await tx
            .update(printingConnectors)
            .set({ revokedAt: new Date() })
            .where(
              and(
                eq(printingConnectors.branchId, ctx.branchId),
                isNull(printingConnectors.revokedAt),
              ),
            );
        }
        await tx
          .update(printJobs)
          .set({
            state: "review",
            error:
              "La configuración de impresión cambió. Revisá el destino antes de enviar.",
          })
          .where(
            and(
              eq(printJobs.branchId, ctx.branchId),
              inArray(printJobs.state, ["pending", "leased"]),
            ),
          );
      } else
        await tx.insert(printingSettings).values({
          branchId: ctx.branchId,
          enabled: command.enabled,
          printerName: command.printerName,
          updatedBy: actor.id,
        });
      result = { id: ctx.branchId };
    } else if (command.action === "pairing") {
      const [settings] = await tx
        .select()
        .from(printingSettings)
        .where(eq(printingSettings.branchId, ctx.branchId));
      if (!settings)
        printError("Guardá primero la impresora que vas a utilizar.");
      await tx
        .delete(printingPairings)
        .where(
          and(
            eq(printingPairings.branchId, ctx.branchId),
            isNull(printingPairings.usedAt),
          ),
        );
      const expiresAt = new Date(Date.now() + 600000),
        code = pairingCode(ctx.branchId, actor.id, requestId);
      const [pair] = await tx
        .insert(printingPairings)
        .values({
          branchId: ctx.branchId,
          codeHash: printHash(code),
          expiresAt,
          createdBy: actor.id,
        })
        .returning();
      result = { id: pair.id, expiresAt: expiresAt.toISOString() };
    } else if (command.action === "revoke") {
      const [value] = await tx
        .update(printingConnectors)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(printingConnectors.id, command.connectorId),
            eq(printingConnectors.branchId, ctx.branchId),
          ),
        )
        .returning();
      if (!value) printError("El conector no pertenece a esta sucursal.", 404);
      result = { id: value.id };
    } else if (command.action === "test") {
      result = await enqueuePrintTest(tx, actor, ctx.branchId);
    } else {
      const { job, ticket, active } = await getJobForUpdate(
        tx,
        command.jobId,
        ctx.branchId,
      );
      if (command.action === "reprint") {
        if (!["original", "copy", "historical"].includes(job.kind))
          printError("Elegí el ticket del pedido, no un aviso de cambio.");
        const historicalUnsent =
          ctx.role !== "staff" &&
          ctx.accountKind !== "store" &&
          job.state === "cancelled";
        if (
          (!historicalUnsent &&
            !["sent", "uncertain"].includes(job.state) &&
            !(job.state === "error" && job.reportOutcome === "failed")) ||
          job.spoolState !== "removed"
        )
          printError(
            "Primero revisá el envío original y comprobá que no siga en la cola de Windows.",
          );
        const historical =
          !active || historicalUnsent || job.kind === "historical";
        if (historical && (ctx.role === "staff" || ctx.accountKind === "store"))
          printError("El encargado debe autorizar las copias históricas.", 403);
        const siblings = await tx
          .select()
          .from(printJobs)
          .where(eq(printJobs.ticketId, ticket.id));
        if (
          siblings.some(
            (j) =>
              ["pending", "leased", "sending"].includes(j.state) ||
              (j.leaseToken !== null && j.spoolState !== "removed"),
          )
        )
          printError("Este ticket ya tiene un envío pendiente.");
        const copyNumber =
          Math.max(0, ...siblings.map((j) => j.copyNumber)) + 1;
        const [currentLocator] = ticket.orderId
          ? await tx
              .select({ number: locatorAssignments.number })
              .from(locatorAssignments)
              .where(
                and(
                  eq(locatorAssignments.orderId, ticket.orderId),
                  isNull(locatorAssignments.returnedAt),
                ),
              )
          : [];
        const locatorChange =
          (currentLocator?.number ?? null) !== ticket.snapshot.locatorNumber
            ? currentLocator
              ? `LOCALIZADOR ACTUAL: ${currentLocator.number}`
              : "ACTUALMENTE SIN LOCALIZADOR"
            : undefined;
        const [settings] = await tx
          .select()
          .from(printingSettings)
          .where(eq(printingSettings.branchId, ctx.branchId));
        if (!settings)
          printError("Guardá primero la configuración de impresión.");
        const [copy] = await tx
          .insert(printJobs)
          .values({
            branchId: ctx.branchId,
            ticketId: ticket.id,
            settingsRevision: settings.revision,
            kind: historical ? "historical" : "copy",
            copyNumber,
            eventKey: `copy:${ticket.id}:${copyNumber}`,
            requestedBy: actor.id,
            reason: command.reason,
            change: locatorChange,
          })
          .returning();
        result = { id: copy.id };
      } else if (command.action === "retry") {
        if (
          !["review", "error"].includes(job.state) ||
          job.reportOutcome !== null ||
          job.spoolJobId !== null ||
          job.spoolState === "present"
        )
          printError(
            "Este envío debe verificarse en Windows antes de reintentarlo.",
          );
        const [settings] = await tx
          .select()
          .from(printingSettings)
          .where(eq(printingSettings.branchId, ctx.branchId));
        if (!settings)
          printError("Guardá primero la configuración de impresión.");
        if (
          !active &&
          !["cancellation", "historical", "test"].includes(job.kind)
        )
          printError(
            "El pedido ya no está activo; no se enviará otra orden de preparación.",
          );
        await tx
          .update(printJobs)
          .set({
            state: "pending",
            error: null,
            reviewedAt: new Date(),
            settingsRevision: settings.revision,
            leaseToken: null,
            leaseExpiresAt: null,
            connectorId: null,
            instanceId: null,
            reportOutcome: null,
          })
          .where(eq(printJobs.id, job.id));
        result = { id: job.id };
      } else {
        if (
          !["review", "uncertain", "error", "sent"].includes(job.state) &&
          !(job.state === "cancelled" && command.queueCleared)
        )
          printError("Este envío todavía está en proceso.");
        await tx
          .update(printJobs)
          .set({
            state: command.result === "printed" ? "sent" : "cancelled",
            error:
              command.result === "printed"
                ? "Salida verificada por encargado"
                : "Descartado por encargado",
            sentAt: command.result === "printed" ? new Date() : job.sentAt,
            spoolState:
              command.result === "printed" || command.queueCleared
                ? "removed"
                : job.spoolState,
          })
          .where(eq(printJobs.id, job.id));
        result = { id: job.id };
      }
    }
    await tx
      .update(printingRequests)
      .set({ result })
      .where(eq(printingRequests.requestId, requestId));
    await audit(
      tx,
      actor,
      "printing",
      String(result.id ?? ctx.branchId),
      command.action,
      { requestId, command: command.action, details: command, result },
    );
    return command.action === "pairing"
      ? { ...result, code: pairingCode(ctx.branchId, actor.id, requestId) }
      : result;
  });
}
async function enqueuePrintTest(tx: Tx, actor: Actor, branchId: string) {
  const [settings] = await tx
    .select()
    .from(printingSettings)
    .where(eq(printingSettings.branchId, branchId));
  if (!settings) printError("Guardá la configuración antes de probar.");
  const [branch] = await tx
    .select()
    .from(branches)
    .where(eq(branches.id, branchId));
  const zero = "00000000-0000-0000-0000-000000000000";
  const snapshot: PrintTicket = {
    version: 1,
    branchName: branch.name,
    timeZone: branch.timeZone,
    saleId: zero,
    orderId: zero,
    saleNumber: 0,
    sequence: 0,
    occurredAt: new Date().toISOString(),
    origin: "PRUEBA",
    consumption: "NO PREPARAR",
    tableName: null,
    externalId: null,
    customerName: null,
    locatorNumber: null,
    stationId: null,
    stationName: "PRUEBA USB",
    notes: "Prueba de caracteres: café, jamón, azúcar, ñ",
    otherStations: [],
    lines: [
      {
        id: zero,
        name: "Prueba de impresión",
        quantity: 1,
        comboName: null,
        notes: "No es un pedido",
        modifiers: [
          {
            groupName: "Leche",
            optionName: "Entera",
            count: 1,
            instruction: null,
          },
        ],
      },
    ],
  };
  const [ticket] = await tx
    .insert(printTickets)
    .values({
      branchId,
      orderId: null,
      stationKey: `test:${randomUUID()}`,
      snapshot,
    })
    .returning();
  const [job] = await tx
    .insert(printJobs)
    .values({
      branchId,
      ticketId: ticket.id,
      settingsRevision: settings.revision,
      kind: "test",
      eventKey: `test:${ticket.id}`,
      requestedBy: actor.id,
    })
    .returning();
  return { id: job.id };
}
