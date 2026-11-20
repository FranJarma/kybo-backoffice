import { randomBytes } from "node:crypto";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { branches } from "@/db/branch-schema";
import {
  printJobs,
  printingConnectors,
  printingPairings,
  printingSettings,
} from "@/db/printing-schema";
import { printingAvailable } from "./availability";
import { connectorCommand } from "./validation";
import { printHash } from "./service";
import { getJobForUpdate, originalDispatchAllowed, printError } from "./jobs";
import { ticketDocument } from "./document";
import type { TicketKind } from "./types";

export async function runConnectorCommand(
  db: AppDb,
  token: string,
  raw: unknown,
) {
  const input = connectorCommand.parse(raw);
  if (!(await printingAvailable(db)))
    printError("La impresión todavía no está habilitada.", 503);
  return db.transaction(async (tx) => {
    if (input.action === "pair") {
      const [pair] = await tx
        .select()
        .from(printingPairings)
        .where(eq(printingPairings.codeHash, printHash(input.code)))
        .for("update");
      if (!pair || pair.usedAt || pair.expiresAt.getTime() <= Date.now())
        printError("El código de vinculación venció o ya fue utilizado.", 401);
      const [settings] = await tx
        .select()
        .from(printingSettings)
        .where(eq(printingSettings.branchId, pair.branchId))
        .for("update");
      const [branch] = await tx
        .select()
        .from(branches)
        .where(
          and(eq(branches.id, pair.branchId), isNull(branches.archivedAt)),
        );
      if (!branch || !settings || settings.printerName !== input.printerName)
        printError(
          "La impresora no coincide con la configuración del local.",
          403,
        );
      const secret = randomBytes(32).toString("base64url");
      await tx
        .update(printingConnectors)
        .set({ revokedAt: new Date() })
        .where(
          and(
            eq(printingConnectors.branchId, pair.branchId),
            isNull(printingConnectors.revokedAt),
          ),
        );
      const [connector] = await tx
        .insert(printingConnectors)
        .values({
          branchId: pair.branchId,
          tokenHash: printHash(secret),
          name: "PC de caja",
          printerName: input.printerName,
        })
        .returning();
      await tx
        .update(printingPairings)
        .set({ usedAt: new Date() })
        .where(eq(printingPairings.id, pair.id));
      return {
        connectorId: connector.id,
        token: secret,
        printerName: connector.printerName,
      };
    }
    if (!/^[A-Za-z0-9_-]{43}$/.test(token))
      printError("El conector no está autorizado.", 401);
    const [connector] = await tx
      .select()
      .from(printingConnectors)
      .where(
        and(
          eq(printingConnectors.tokenHash, printHash(token)),
          isNull(printingConnectors.revokedAt),
        ),
      )
      .for("update");
    if (!connector)
      printError("El conector fue revocado o no está autorizado.", 401);
    const [branch] = await tx
      .select({ id: branches.id })
      .from(branches)
      .where(
        and(eq(branches.id, connector.branchId), isNull(branches.archivedAt)),
      );
    if (!branch) printError("La sucursal ya no está habilitada.", 403);
    if (
      connector.instanceId &&
      connector.instanceId !== input.instanceId &&
      connector.lastSeenAt &&
      Date.now() - connector.lastSeenAt.getTime() < 20000
    )
      printError("Ya hay otro proceso activo para esta impresora.");
    if (
      input.action !== "heartbeat" &&
      connector.instanceId !== input.instanceId
    )
      printError(
        "El conector debe actualizar su estado antes de continuar.",
        403,
      );
    if (input.action === "heartbeat") {
      await tx
        .update(printingConnectors)
        .set({
          instanceId: input.instanceId,
          lastSeenAt: new Date(),
          printerStatus: input.printerStatus,
          printerMessage: input.printerMessage ?? null,
        })
        .where(eq(printingConnectors.id, connector.id));
      const reconcile = await tx
        .select({
          id: printJobs.id,
          leaseToken: printJobs.leaseToken,
          spoolJobId: printJobs.spoolJobId,
        })
        .from(printJobs)
        .where(
          and(
            eq(printJobs.connectorId, connector.id),
            eq(printJobs.instanceId, input.instanceId),
            inArray(printJobs.state, [
              "sent",
              "sending",
              "uncertain",
              "cancelled",
            ]),
            sql`${printJobs.leaseToken} is not null`,
            sql`${printJobs.spoolState} <> 'removed'`,
          ),
        )
        .orderBy(asc(printJobs.createdAt))
        .limit(30);
      return {
        ok: true,
        serverNow: new Date().toISOString(),
        reconcile: reconcile.map((r) => ({
          ...r,
          documentName: `Kybo-${r.id}`,
        })),
      };
    }
    const [settings] = await tx
      .select()
      .from(printingSettings)
      .where(eq(printingSettings.branchId, connector.branchId));
    if (input.action === "claim") {
      const rows = await tx
        .select({ id: printJobs.id })
        .from(printJobs)
        .where(
          and(
            eq(printJobs.branchId, connector.branchId),
            or(
              eq(printJobs.state, "pending"),
              and(
                inArray(printJobs.state, ["leased", "sending"]),
                sql`${printJobs.leaseExpiresAt} < now()`,
              ),
            ),
          ),
        )
        .orderBy(asc(printJobs.createdAt), asc(printJobs.id))
        .limit(30);
      const [inFlight] = await tx
        .select({ id: printJobs.id })
        .from(printJobs)
        .where(
          and(
            eq(printJobs.branchId, connector.branchId),
            inArray(printJobs.state, ["leased", "sending"]),
            sql`${printJobs.leaseExpiresAt} >= now()`,
          ),
        )
        .limit(1);
      if (inFlight) return { job: null };
      for (const row of rows) {
        const { job, ticket, active } = await getJobForUpdate(
          tx,
          row.id,
          connector.branchId,
        );
        if (job.state === "sending") {
          await tx
            .update(printJobs)
            .set({
              state: "uncertain",
              error:
                "El envío se interrumpió. Revisá el papel y la cola de Windows.",
            })
            .where(eq(printJobs.id, job.id));
          continue;
        }
        if (job.state === "leased") {
          await tx
            .update(printJobs)
            .set({
              state: "review",
              error:
                "El conector perdió la ventana de envío. Revisá este ticket.",
            })
            .where(eq(printJobs.id, job.id));
          continue;
        }
        if (job.state !== "pending") continue;
        if (
          job.kind !== "test" &&
          (!settings?.enabled || settings.printerName !== connector.printerName)
        )
          continue;
        if (
          settings?.revision !== job.settingsRevision ||
          Date.now() - (job.reviewedAt ?? job.createdAt).getTime() > 60000 ||
          (!active &&
            !["cancellation", "historical", "test"].includes(job.kind)) ||
          (job.kind === "original" &&
            !(await originalDispatchAllowed(tx, ticket)))
        ) {
          await tx
            .update(printJobs)
            .set({
              state: "review",
              error:
                "El pedido cambió o el envío quedó demorado. Revisalo antes de imprimir.",
            })
            .where(eq(printJobs.id, job.id));
          continue;
        }
        if (["copy", "historical"].includes(job.kind)) {
          const siblings = await tx
            .select({ id: printJobs.id })
            .from(printJobs)
            .where(
              and(
                eq(printJobs.ticketId, ticket.id),
                sql`${printJobs.id} <> ${job.id}::uuid`,
                sql`${printJobs.leaseToken} is not null`,
                sql`${printJobs.spoolState} <> 'removed'`,
              ),
            );
          if (siblings.length) continue;
        }
        const leaseToken = randomBytes(32).toString("hex"),
          leaseExpiresAt = new Date(Date.now() + 60000);
        await tx
          .update(printJobs)
          .set({
            state: "leased",
            connectorId: connector.id,
            instanceId: input.instanceId,
            leaseToken,
            leaseExpiresAt,
          })
          .where(eq(printJobs.id, job.id));
        return {
          job: {
            id: job.id,
            leaseToken,
            leaseExpiresAt: leaseExpiresAt.toISOString(),
            printerName: connector.printerName,
            documentName: `Kybo-${job.id}`,
            document: ticketDocument(ticket.snapshot, {
              kind: job.kind as TicketKind,
              copyNumber: job.copyNumber,
              requestedAt: job.createdAt.toISOString(),
              change: job.change ?? undefined,
            }),
          },
        };
      }
      return { job: null };
    }
    const { job, ticket, active } = await getJobForUpdate(
      tx,
      input.jobId,
      connector.branchId,
    );
    if (
      job.connectorId !== connector.id ||
      job.instanceId !== input.instanceId ||
      job.leaseToken !== input.leaseToken
    )
      printError("Este envío no pertenece al conector o intento actual.", 403);
    if (input.action === "begin") {
      if (job.state !== "leased") return { dispatch: false };
      if (
        !job.leaseExpiresAt ||
        job.leaseExpiresAt.getTime() <= Date.now() ||
        (!settings?.enabled && job.kind !== "test") ||
        settings?.printerName !== connector.printerName ||
        settings?.revision !== job.settingsRevision ||
        (!active &&
          !["cancellation", "historical", "test"].includes(job.kind)) ||
        (job.kind === "original" &&
          !(await originalDispatchAllowed(tx, ticket)))
      ) {
        await tx
          .update(printJobs)
          .set({
            state: "review",
            error: "El pedido o la impresora cambió antes del envío.",
          })
          .where(eq(printJobs.id, job.id));
        return { dispatch: false };
      }
      await tx
        .update(printJobs)
        .set({ state: "sending" })
        .where(eq(printJobs.id, job.id));
      return { dispatch: true };
    }
    if (input.action === "reconcile") {
      await tx
        .update(printJobs)
        .set({
          spoolState: input.outcome,
          spoolJobId: input.spoolJobId ?? job.spoolJobId,
        })
        .where(eq(printJobs.id, job.id));
      return { ok: true };
    }
    if (job.reportOutcome) {
      if (job.reportOutcome !== input.outcome)
        printError("El resultado de este envío ya fue registrado.");
      return { ok: true };
    }
    // A journal ACK may arrive after the manager verified the paper and queue.
    // Record the machine result without undoing that explicit resolution.
    if (
      job.state === "sent" ||
      (job.state === "cancelled" && job.error === "Descartado por encargado")
    ) {
      await tx
        .update(printJobs)
        .set({
          reportOutcome: input.outcome,
          spoolJobId: input.spoolJobId ?? job.spoolJobId,
        })
        .where(eq(printJobs.id, job.id));
      return { ok: true };
    }
    if (!["sending", "uncertain", "cancelled"].includes(job.state))
      printError("Este trabajo no comenzó su envío a Windows.");
    await tx
      .update(printJobs)
      .set({
        state:
          job.state === "cancelled"
            ? "cancelled"
            : input.outcome === "sent"
              ? "sent"
              : input.outcome === "failed"
                ? "error"
                : input.outcome === "cancelled"
                  ? "cancelled"
                  : "uncertain",
        reportOutcome: input.outcome,
        spoolJobId: input.spoolJobId ?? null,
        spoolState: input.outcome === "failed" ? "removed" : "unknown",
        sentAt: input.outcome === "sent" ? new Date() : job.sentAt,
        error: input.error ?? null,
      })
      .where(eq(printJobs.id, job.id));
    return { ok: true };
  });
}
