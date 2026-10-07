import { and, eq, inArray } from "drizzle-orm";
import type { Tx } from "@/db/types";
import { sales, saleOrders, saleLines } from "@/db/sales-schema";
import {
  preparationTasks,
  preparationTaskLines,
} from "@/db/preparation-schema";
import { saleLineFulfillments } from "@/db/fulfillment-event-schema";
import {
  stockResolutions,
  stockResolutionLines,
  stockResolutionEvents,
} from "@/db/stock-resolution-schema";
import { reservationAllocations } from "@/db/reservation-schema";
import type { OperationalContext, StockAllocation } from "../operations/types";
import { settleReservation } from "../inventory/reservations";
import { lockStock } from "../inventory/locking";
import { postMovement } from "../inventory/ledger";
import { integer, six } from "../inventory/decimal";
import { AppError } from "@/lib/errors";
function fail(message: string): never {
  throw new AppError("RESOLUTION_CONFLICT", message, 409);
}
export async function cancelStock(
  tx: Tx,
  ctx: OperationalContext,
  saleId: string,
  operationId: string,
) {
  const [sale] = await tx
    .select()
    .from(sales)
    .where(and(eq(sales.id, saleId), eq(sales.branchId, ctx.branchId)))
    .for("update");
  if (!sale) fail("La venta no pertenece a esta sucursal.");
  const [existing] = await tx
    .select()
    .from(stockResolutions)
    .where(eq(stockResolutions.saleId, saleId));
  if (existing) return { resolutionId: existing.id, status: existing.state };
  const lines = await tx
    .select({ physical: saleLineFulfillments })
    .from(saleLineFulfillments)
    .innerJoin(saleLines, eq(saleLines.id, saleLineFulfillments.saleLineId))
    .innerJoin(saleOrders, eq(saleOrders.id, saleLines.orderId))
    .where(
      and(
        eq(saleOrders.saleId, saleId),
        eq(saleLineFulfillments.branchId, ctx.branchId),
      ),
    )
    .orderBy(saleLineFulfillments.saleLineId)
    .for("update");
  const [resolution] = await tx
    .insert(stockResolutions)
    .values({ saleId, branchId: ctx.branchId })
    .returning();
  if (!lines.length) {
    await tx
      .update(stockResolutions)
      .set({ state: "resolved" })
      .where(eq(stockResolutions.id, resolution.id));
    return { resolutionId: resolution.id, status: "resolved" };
  }
  const allocations = await tx
    .select()
    .from(reservationAllocations)
    .where(
      inArray(
        reservationAllocations.reservationId,
        lines.map((l) => l.physical.reservationId),
      ),
    )
    .orderBy(
      reservationAllocations.itemId,
      reservationAllocations.locationId,
      reservationAllocations.lotId,
    );
  await lockStock(tx, ctx, allocations, true);
  let pending = false;
  for (const { physical: row } of lines) {
    const [task] = await tx
      .select({ status: preparationTasks.status })
      .from(preparationTaskLines)
      .innerJoin(
        preparationTasks,
        eq(preparationTasks.id, preparationTaskLines.taskId),
      )
      .where(eq(preparationTaskLines.lineId, row.saleLineId));
    const inProcess = row.mode === "recipe" && task?.status === "preparing";
    const release: StockAllocation[] = [];
    for (const a of allocations.filter(
      (a) => a.reservationId === row.reservationId,
    )) {
      const remaining =
        integer(a.allocated) - integer(a.consumed) - integer(a.released);
      if (remaining <= 0n) continue;
      if (inProcess) {
        pending = true;
        await tx
          .insert(stockResolutionLines)
          .values({
            resolutionId: resolution.id,
            branchId: ctx.branchId,
            saleLineId: row.saleLineId,
            allocationId: a.id,
            pending: six(remaining),
          });
      } else
        release.push({
          itemId: a.itemId,
          lotId: a.lotId,
          locationId: a.locationId,
          quantity: six(remaining),
        });
    }
    if (release.length)
      await settleReservation(tx, ctx, {
        reservationId: row.reservationId,
        consume: [],
        release,
        operationId,
      });
    const alreadyUsed = row.mode === "recipe" ? row.completed : row.delivered;
    await tx
      .update(saleLineFulfillments)
      .set({ cancelled: row.ordered - alreadyUsed, revision: row.revision + 1 })
      .where(eq(saleLineFulfillments.saleLineId, row.saleLineId));
  }
  const status = pending ? "pending" : "resolved";
  await tx
    .update(stockResolutions)
    .set({ state: status })
    .where(eq(stockResolutions.id, resolution.id));
  return { resolutionId: resolution.id, status };
}
export async function resolveCancellation(
  tx: Tx,
  ctx: OperationalContext,
  input: {
    operationId: string;
    resolutionId: string;
    expectedRevision: number;
    lines: { resolutionLineId: string; consumed: string; unused: string }[];
    reason: string;
  },
) {
  if (ctx.role === "staff")
    throw new AppError(
      "FORBIDDEN",
      "Un encargado debe resolver el consumo físico.",
      403,
    );
  if (
    !input.reason.trim() ||
    !input.lines.length ||
    new Set(input.lines.map((l) => l.resolutionLineId)).size !==
      input.lines.length
  )
    fail("Indicá un motivo y líneas distintas.");
  const [resolution] = await tx
    .select()
    .from(stockResolutions)
    .where(
      and(
        eq(stockResolutions.id, input.resolutionId),
        eq(stockResolutions.branchId, ctx.branchId),
      ),
    )
    .for("update");
  if (
    !resolution ||
    resolution.state !== "pending" ||
    resolution.revision !== input.expectedRevision
  )
    fail("La resolución cambió o no está pendiente.");
  const rows = await tx
    .select({
      line: stockResolutionLines,
      allocation: reservationAllocations,
      fulfillment: saleLineFulfillments,
    })
    .from(stockResolutionLines)
    .innerJoin(
      reservationAllocations,
      eq(reservationAllocations.id, stockResolutionLines.allocationId),
    )
    .innerJoin(
      saleLineFulfillments,
      eq(saleLineFulfillments.saleLineId, stockResolutionLines.saleLineId),
    )
    .where(eq(stockResolutionLines.resolutionId, resolution.id))
    .orderBy(stockResolutionLines.id)
    .for("update");
  await lockStock(
    tx,
    ctx,
    rows.map((r) => r.allocation),
    true,
  );
  for (const change of input.lines) {
    const row = rows.find((r) => r.line.id === change.resolutionLineId);
    if (!row) fail("La línea no corresponde a esta resolución.");
    if (
      ![change.consumed, change.unused].every((q) =>
        /^\d{1,12}\.\d{6}$/.test(q),
      )
    )
      fail("Cantidades inválidas.");
    const consumed = integer(change.consumed),
      unused = integer(change.unused);
    if (
      consumed + unused <= 0n ||
      consumed + unused >
        integer(row.line.pending) -
          integer(row.line.consumed) -
          integer(row.line.unused)
    )
      fail("La cantidad supera lo pendiente.");
    const a = row.allocation;
    const allocation = {
      itemId: a.itemId,
      lotId: a.lotId,
      locationId: a.locationId,
    };
    await settleReservation(tx, ctx, {
      operationId: input.operationId,
      reservationId: a.reservationId,
      consume: consumed ? [{ ...allocation, quantity: change.consumed }] : [],
      release: unused ? [{ ...allocation, quantity: change.unused }] : [],
    });
    // A physical loss is recorded even if its lot was blocked after work started.
    if (consumed)
      await postMovement(tx, ctx, {
        operationId: input.operationId,
        documentId: row.fulfillment.documentId,
        action: "waste",
        reason: input.reason,
        legs: [
          {
            ...allocation,
            quantity: change.consumed,
            direction: "out",
            incomingValue: null,
          },
        ],
      });
    row.line.consumed = six(integer(row.line.consumed) + consumed);
    row.line.unused = six(integer(row.line.unused) + unused);
    await tx
      .update(stockResolutionLines)
      .set({ consumed: row.line.consumed, unused: row.line.unused })
      .where(eq(stockResolutionLines.id, row.line.id));
    await tx
      .insert(stockResolutionEvents)
      .values({
        operationId: input.operationId,
        resolutionLineId: row.line.id,
        consumed: change.consumed,
        unused: change.unused,
        reason: input.reason,
      });
  }
  const state = rows.every(
    (r) =>
      integer(r.line.pending) ===
      integer(r.line.consumed) + integer(r.line.unused),
  )
    ? "resolved"
    : "pending";
  await tx
    .update(stockResolutions)
    .set({ state, revision: resolution.revision + 1 })
    .where(eq(stockResolutions.id, resolution.id));
  return { state, revision: resolution.revision + 1 };
}
