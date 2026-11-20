import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Tx } from "@/db/types";
import { printJobs, printTickets } from "@/db/printing-schema";
import { sales, saleOrders, saleLines } from "@/db/sales-schema";
import { preparationTasks } from "@/db/preparation-schema";
import { saleLineFulfillments } from "@/db/fulfillment-event-schema";
import { AppError } from "@/lib/errors";
export function printError(message: string, status = 409): never {
  throw new AppError("PRINTING_CONFLICT", message, status);
}
export async function lockPrintTicket(
  tx: Tx,
  ticketId: string,
  branchId: string,
) {
  const [value] = await tx
    .select()
    .from(printTickets)
    .where(
      and(eq(printTickets.id, ticketId), eq(printTickets.branchId, branchId)),
    );
  if (!value) printError("El ticket no pertenece a esta sucursal.", 404);
  let active = true;
  if (value.orderId) {
    const [sale] = await tx
      .select({ id: sales.id, status: sales.status })
      .from(saleOrders)
      .innerJoin(sales, eq(sales.id, saleOrders.saleId))
      .where(
        and(
          eq(saleOrders.id, value.orderId),
          eq(saleOrders.branchId, branchId),
        ),
      )
      .for("update", { of: sales });
    if (!sale) printError("No encontramos el pedido.", 404);
    active = sale.status !== "cancelled";
    const tasks = await tx
      .select({ state: preparationTasks.status })
      .from(preparationTasks)
      .where(
        and(
          eq(preparationTasks.orderId, value.orderId),
          value.snapshot.stationId
            ? eq(preparationTasks.stationId, value.snapshot.stationId)
            : isNull(preparationTasks.stationId),
        ),
      );
    const physical = await tx
      .select({
        ordered: saleLineFulfillments.ordered,
        delivered: saleLineFulfillments.delivered,
        cancelled: saleLineFulfillments.cancelled,
      })
      .from(saleLines)
      .innerJoin(
        saleLineFulfillments,
        eq(saleLineFulfillments.saleLineId, saleLines.id),
      )
      .where(
        inArray(
          saleLines.id,
          value.snapshot.lines.map((l) => l.id),
        ),
      );
    if (
      physical.length
        ? physical.every((p) => p.delivered + p.cancelled >= p.ordered)
        : tasks.length &&
          tasks.every((t) => ["delivered", "cancelled"].includes(t.state))
    )
      active = false;
  }
  const [ticket] = await tx
    .select()
    .from(printTickets)
    .where(eq(printTickets.id, value.id))
    .for("update");
  return { ticket, active };
}
export async function getJobForUpdate(tx: Tx, jobId: string, branchId: string) {
  const [initial] = await tx
    .select()
    .from(printJobs)
    .where(and(eq(printJobs.id, jobId), eq(printJobs.branchId, branchId)));
  if (!initial) printError("El envío no pertenece a esta sucursal.", 404);
  const { ticket, active } = await lockPrintTicket(
    tx,
    initial.ticketId,
    branchId,
  );
  const [job] = await tx
    .select()
    .from(printJobs)
    .where(eq(printJobs.id, initial.id))
    .for("update");
  return { ticket, job, active };
}
export async function originalDispatchAllowed(
  tx: Tx,
  ticket: typeof printTickets.$inferSelect,
) {
  if (!ticket.orderId) return true;
  const tasks = await tx
    .select({ state: preparationTasks.status })
    .from(preparationTasks)
    .where(
      and(
        eq(preparationTasks.orderId, ticket.orderId),
        ticket.snapshot.stationId
          ? eq(preparationTasks.stationId, ticket.snapshot.stationId)
          : isNull(preparationTasks.stationId),
      ),
    );
  return tasks.every((t) => t.state === "pending");
}
