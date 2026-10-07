import { and, eq } from "drizzle-orm";
import type { Tx } from "@/db/types";
import { saleLineFulfillments } from "@/db/fulfillment-event-schema";
import { stockDocuments, stockReturns } from "@/db/inventory-document-schema";
import { stockMovements } from "@/db/stock-movement-schema";
import type { OperationalContext } from "../operations/types";
import { postMovement } from "../inventory/ledger";
import { integer, six } from "../inventory/decimal";
import { transferPortion } from "../transfers/value";
import { AppError } from "@/lib/errors";
import { locations } from "@/db/branch-schema";
/** Explicit physical return of resale stock; a refund never invokes this function. */
export async function returnResale(
  tx: Tx,
  ctx: OperationalContext,
  input: {
    operationId: string;
    saleLineId: string;
    lotId: string;
    locationId: string;
    quantity: string;
    reason: string;
  },
) {
  if (ctx.role === "staff")
    throw new AppError("FORBIDDEN", "Se requiere permiso de encargado.", 403);
  const [location] = await tx
    .select()
    .from(locations)
    .where(
      and(
        eq(locations.id, input.locationId),
        eq(locations.branchId, ctx.branchId),
      ),
    )
    .for("share");
  if (!location || location.archivedAt)
    throw new AppError(
      "RETURN_CONFLICT",
      "Elegí una ubicación activa de esta sucursal.",
      409,
    );
  const [line] = await tx
    .select()
    .from(saleLineFulfillments)
    .where(
      and(
        eq(saleLineFulfillments.saleLineId, input.saleLineId),
        eq(saleLineFulfillments.branchId, ctx.branchId),
      ),
    )
    .for("update");
  if (!line || line.mode !== "direct")
    throw new AppError(
      "RETURN_CONFLICT",
      "Solo se reingresan artículos de reventa entregados. Una preparación no se desarma en ingredientes.",
      409,
    );
  const original = await tx
    .select()
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.documentId, line.documentId),
        eq(stockMovements.lotId, input.lotId),
        eq(stockMovements.action, "direct_dispatch"),
      ),
    );
  if (!original.length)
    throw new AppError(
      "RETURN_CONFLICT",
      "El lote no fue entregado en esta venta.",
      409,
    );
  const returned = await tx
    .select({ movement: stockMovements })
    .from(stockReturns)
    .innerJoin(stockDocuments, eq(stockDocuments.returnId, stockReturns.id))
    .innerJoin(stockMovements, eq(stockMovements.documentId, stockDocuments.id))
    .where(
      and(
        eq(stockReturns.saleLineId, input.saleLineId),
        eq(stockMovements.lotId, input.lotId),
      ),
    );
  const total = -original.reduce((s, m) => s + integer(m.quantity), 0n);
  const totalValue = original.some((m) => m.value === null)
    ? null
    : -original.reduce((s, m) => s + integer(m.value!), 0n);
  const prior = returned.reduce((s, m) => s + integer(m.movement.quantity), 0n);
  const priorValue = returned.reduce(
    (s, m) => s + integer(m.movement.value ?? "0"),
    0n,
  );
  const value = transferPortion(
    total,
    totalValue,
    prior,
    priorValue,
    integer(input.quantity),
  );
  const [record] = await tx
    .insert(stockReturns)
    .values({
      branchId: ctx.branchId,
      actorId: ctx.actorId,
      saleLineId: input.saleLineId,
      reason: input.reason,
    })
    .returning();
  const [document] = await tx
    .insert(stockDocuments)
    .values({ branchId: ctx.branchId, kind: "return", returnId: record.id })
    .returning();
  await postMovement(tx, ctx, {
    operationId: input.operationId,
    documentId: document.id,
    action: "return",
    reason: input.reason,
    legs: [
      {
        itemId: original[0].itemId,
        lotId: input.lotId,
        locationId: input.locationId,
        quantity: input.quantity,
        direction: "in",
        incomingValue: value === null ? null : six(value),
      },
    ],
  });
  return { id: record.id };
}
