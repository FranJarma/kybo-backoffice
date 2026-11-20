import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Actor } from "@/lib/access";
import type { Tx } from "@/db/types";
import { branches } from "@/db/branch-schema";
import { saleLines, saleOrders, sales } from "@/db/sales-schema";
import {
  preparationRoutes,
  preparationStations,
  preparationTaskLines,
  preparationTasks,
} from "@/db/preparation-schema";
import { saleLineModifiers } from "@/db/modifier-schema";
import { locatorAssignments } from "@/db/pickup-schema";
import {
  printJobs,
  printTickets,
  printingSettings,
} from "@/db/printing-schema";
import { printingAvailable } from "./availability";
import { groupPrintLines } from "./document";
import type { PrintTicket } from "./types";

export async function enqueueOrderPrints(
  tx: Tx,
  actor: Actor,
  orderId: string,
) {
  if (!actor.branchId || !(await printingAvailable(tx))) return;
  const [settings] = await tx
    .select()
    .from(printingSettings)
    .where(eq(printingSettings.branchId, actor.branchId));
  if (!settings?.enabled) return;
  const [header] = await tx
    .select({ order: saleOrders, sale: sales, branch: branches })
    .from(saleOrders)
    .innerJoin(sales, eq(sales.id, saleOrders.saleId))
    .innerJoin(branches, eq(branches.id, saleOrders.branchId))
    .where(
      and(eq(saleOrders.id, orderId), eq(saleOrders.branchId, actor.branchId)),
    );
  if (!header || header.sale.status === "cancelled") return;
  const rows = await tx
    .select({
      line: saleLines,
      taskId: preparationTasks.id,
      taskStation: preparationTasks.stationId,
      taskName: preparationTasks.stationName,
      stationId: preparationStations.id,
      stationName: preparationStations.name,
    })
    .from(saleLines)
    .leftJoin(
      preparationTaskLines,
      eq(preparationTaskLines.lineId, saleLines.id),
    )
    .leftJoin(
      preparationTasks,
      eq(preparationTasks.id, preparationTaskLines.taskId),
    )
    .leftJoin(
      preparationRoutes,
      and(
        eq(preparationRoutes.productId, saleLines.productId),
        eq(preparationRoutes.branchId, actor.branchId),
      ),
    )
    .leftJoin(
      preparationStations,
      and(
        eq(preparationStations.id, preparationRoutes.stationId),
        isNull(preparationStations.archivedAt),
      ),
    )
    .where(eq(saleLines.orderId, orderId))
    .orderBy(asc(saleLines.position));
  if (!rows.length) return;
  const modifiers = await tx
    .select()
    .from(saleLineModifiers)
    .where(
      inArray(
        saleLineModifiers.saleLineId,
        rows.map((r) => r.line.id),
      ),
    );
  const groups = groupPrintLines(
    rows.map((r) => ({
      id: r.line.id,
      quantity: r.line.quantity,
      name: r.line.name,
      notes: r.line.notes,
      lineKind: r.line.lineKind,
      parentLineId: r.line.parentLineId,
      stationId: r.taskId ? r.taskStation : r.stationId,
      stationName: r.taskId
        ? r.taskStation
          ? r.taskName
          : null
        : r.stationName,
      modifiers: modifiers
        .filter((m) => m.saleLineId === r.line.id)
        .map((m) => ({
          groupName: m.groupName,
          optionName: m.optionName,
          count: m.count,
          instruction: m.instruction,
        })),
    })),
  );
  const [locator] = await tx
    .select({ number: locatorAssignments.number })
    .from(locatorAssignments)
    .where(
      and(
        eq(locatorAssignments.orderId, orderId),
        isNull(locatorAssignments.returnedAt),
      ),
    );
  const consumption: Record<string, string> = {
    takeaway: "Para llevar",
    dine_in: "En el local",
    delivery: "Delivery",
    pickup: "Retiro",
  };
  const origins: Record<string, string> = {
    counter: "Mostrador",
    table: "Mesa",
    delivery: "Delivery",
  };
  for (const group of groups) {
    const snapshot: PrintTicket = {
      version: 1,
      branchName: header.branch.name,
      timeZone: header.branch.timeZone,
      saleId: header.sale.id,
      orderId,
      saleNumber: header.sale.number,
      sequence: header.order.sequence,
      occurredAt: header.order.createdAt.toISOString(),
      origin: origins[header.sale.origin] ?? header.sale.origin,
      consumption:
        consumption[header.sale.fulfillment] ?? header.sale.fulfillment,
      tableName: header.sale.tableName,
      externalId: header.sale.externalId,
      customerName: header.sale.customerName,
      locatorNumber: locator?.number ?? null,
      stationId: group.stationId,
      stationName: group.stationName,
      notes: header.order.notes,
      otherStations: groups
        .filter((g) => g !== group)
        .map((g) => g.stationName),
      lines: group.lines,
    };
    const [ticket] = await tx
      .insert(printTickets)
      .values({
        branchId: actor.branchId,
        orderId,
        stationKey: group.stationId ?? "general",
        snapshot,
      })
      .onConflictDoNothing()
      .returning();
    if (ticket)
      await tx.insert(printJobs).values({
        branchId: actor.branchId,
        ticketId: ticket.id,
        settingsRevision: settings.revision,
        kind: "original",
        eventKey: `original:${ticket.id}`,
        requestedBy: actor.id,
      });
  }
}

export async function cancelOrderPrints(tx: Tx, actor: Actor, saleId: string) {
  if (!actor.branchId || !(await printingAvailable(tx))) return;
  const [settings] = await tx
    .select()
    .from(printingSettings)
    .where(eq(printingSettings.branchId, actor.branchId));
  if (!settings) return;
  const tickets = await tx
    .select({ ticket: printTickets })
    .from(printTickets)
    .innerJoin(saleOrders, eq(saleOrders.id, printTickets.orderId))
    .where(
      and(
        eq(saleOrders.saleId, saleId),
        eq(printTickets.branchId, actor.branchId),
      ),
    )
    .orderBy(printTickets.id)
    .for("update", { of: printTickets });
  for (const { ticket } of tickets) {
    const jobs = await tx
      .select()
      .from(printJobs)
      .where(eq(printJobs.ticketId, ticket.id))
      .orderBy(printJobs.id)
      .for("update");
    for (const job of jobs)
      if (
        ["pending", "leased", "review", "error"].includes(job.state) &&
        job.spoolJobId === null
      )
        await tx
          .update(printJobs)
          .set({
            state: "cancelled",
            spoolState: "removed",
            error: "Pedido anulado antes de enviar.",
          })
          .where(eq(printJobs.id, job.id));
    if (jobs.some((j) => ["sending", "sent", "uncertain"].includes(j.state)))
      await tx
        .insert(printJobs)
        .values({
          branchId: actor.branchId,
          ticketId: ticket.id,
          settingsRevision: settings.revision,
          kind: "cancellation",
          eventKey: `cancel:${ticket.id}`,
          requestedBy: actor.id,
          reason: "Venta anulada",
        })
        .onConflictDoNothing();
  }
}
export async function notifyLocatorChange(
  tx: Tx,
  actor: Actor,
  orderId: string,
  eventId: string,
) {
  if (!actor.branchId || !(await printingAvailable(tx))) return;
  const [settings] = await tx
    .select()
    .from(printingSettings)
    .where(eq(printingSettings.branchId, actor.branchId));
  if (!settings) return;
  const tickets = await tx
    .select()
    .from(printTickets)
    .where(
      and(
        eq(printTickets.orderId, orderId),
        eq(printTickets.branchId, actor.branchId),
      ),
    )
    .orderBy(printTickets.id)
    .for("update");
  const [locator] = await tx
    .select()
    .from(locatorAssignments)
    .where(
      and(
        eq(locatorAssignments.orderId, orderId),
        isNull(locatorAssignments.returnedAt),
      ),
    );
  for (const ticket of tickets) {
    await tx
      .insert(printJobs)
      .values({
        branchId: actor.branchId,
        ticketId: ticket.id,
        settingsRevision: settings.revision,
        kind: "change",
        eventKey: `locator:${ticket.id}:${eventId}`,
        requestedBy: actor.id,
        change: locator
          ? `LOCALIZADOR ACTUAL: ${locator.number}`
          : "LOCALIZADOR DEVUELTO",
        reason: "Cambio de localizador",
      })
      .onConflictDoNothing();
  }
}
