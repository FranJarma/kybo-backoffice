import { and, eq } from "drizzle-orm";
import type { Tx } from "@/db/types";
import { inventoryLots } from "@/db/inventory-schema";
import { stockDocuments } from "@/db/inventory-document-schema";
import {
  inventoryValuations,
  locationStockBalances,
  lotLocationBalances,
  stockOperations,
} from "@/db/stock-schema";
import { stockMovements } from "@/db/stock-movement-schema";
import type { OperationalContext, StockAllocation } from "../operations/types";
import { lockStock } from "./locking";
import { nextValuation } from "./valuation";
import { integer, six, safeQuantity, safeScaled } from "./decimal";
import { convertToBase } from "../items/units";
import { businessDate } from "../operations/business-date";
import { AppError } from "@/lib/errors";
export type PostingLeg = StockAllocation & {
  direction: "in" | "out";
  incomingValue: string | null;
};
export type PostingInput = {
  operationId: string;
  documentId: string;
  action:
    | "receipt"
    | "opening"
    | "count"
    | "waste"
    | "production"
    | "sale_consume"
    | "direct_dispatch"
    | "transfer"
    | "internal_use"
    | "return";
  legs: PostingLeg[];
  reason: string | null;
};
const conflict = (message: string): never => {
  throw new AppError("STOCK_CONFLICT", message, 409);
};
export async function postMovement(
  tx: Tx,
  ctx: OperationalContext,
  input: PostingInput,
): Promise<{ value: string | null }[]> {
  const [document] = await tx
    .select()
    .from(stockDocuments)
    .where(
      and(
        eq(stockDocuments.id, input.documentId),
        eq(stockDocuments.branchId, ctx.branchId),
      ),
    );
  const [operation] = await tx
    .select()
    .from(stockOperations)
    .where(
      and(
        eq(stockOperations.id, input.operationId),
        eq(stockOperations.branchId, ctx.branchId),
        eq(stockOperations.actorId, ctx.actorId),
      ),
    );
  if (!document || !operation)
    conflict("Falta el documento o la operación de esta sucursal.");
  const originForAction: Record<PostingInput["action"], string[]> = {
    receipt: ["receipt"],
    opening: ["adjustment"],
    count: ["adjustment"],
    waste: ["adjustment", "sale", "production"],
    production: ["production"],
    sale_consume: ["sale"],
    direct_dispatch: ["sale"],
    transfer: ["transfer"],
    internal_use: ["internal_use"],
    return: ["return"],
  };
  if (!originForAction[input.action].includes(document.kind))
    conflict("El movimiento no corresponde al documento de origen.");
  if (!input.legs.length) conflict("La operación no tiene movimientos.");
  await lockStock(tx, ctx, input.legs, true);
  const result: { value: string | null }[] = [];
  // Preserve caller leg order for paired internal transfers; locks were already sorted.
  for (const leg of input.legs) {
    const q = integer(convertToBase(leg.quantity, "unit", "unit"));
    if (q <= 0n) conflict("El movimiento debe tener una cantidad positiva.");
    const [lot] = await tx
      .select()
      .from(inventoryLots)
      .where(eq(inventoryLots.id, leg.lotId))
      .for("update");
    if (!lot || lot.itemId !== leg.itemId)
      conflict("El lote no corresponde al artículo.");
    await tx
      .insert(lotLocationBalances)
      .values({
        lotId: leg.lotId,
        locationId: leg.locationId,
        branchId: ctx.branchId,
      })
      .onConflictDoNothing();
    const [balance] = await tx
      .select()
      .from(lotLocationBalances)
      .where(
        and(
          eq(lotLocationBalances.lotId, leg.lotId),
          eq(lotLocationBalances.locationId, leg.locationId),
        ),
      )
      .for("update");
    const [locationBalance] = await tx
      .select()
      .from(locationStockBalances)
      .where(
        and(
          eq(locationStockBalances.itemId, leg.itemId),
          eq(locationStockBalances.locationId, leg.locationId),
        ),
      )
      .for("update");
    const [valuation] = await tx
      .select()
      .from(inventoryValuations)
      .where(
        and(
          eq(inventoryValuations.itemId, leg.itemId),
          eq(inventoryValuations.branchId, ctx.branchId),
        ),
      )
      .for("update");
    const outgoing = leg.direction === "out";
    if (outgoing && integer(balance.quantity) - integer(balance.reserved) < q)
      conflict("La cantidad está reservada o supera las existencias.");
    if (
      outgoing &&
      !["waste", "count"].includes(input.action) &&
      (lot.blocked ||
        balance.blocked ||
        (lot.expiresOn !== null &&
          lot.expiresOn <= businessDate(new Date(), ctx.timeZone)))
    )
      conflict("El lote está bloqueado o vencido.");
    if (
      leg.incomingValue !== null &&
      !/^\d{1,18}\.\d{6}$/.test(leg.incomingValue)
    )
      conflict("Valor de ingreso inválido.");
    const delta = outgoing ? -q : q;
    const valued = nextValuation(
      integer(valuation.quantity),
      valuation.value === null ? null : integer(valuation.value),
      delta,
      leg.incomingValue === null ? null : integer(leg.incomingValue),
    );
    for (const v of [valued.value, valued.appliedValue])
      if (v !== null) safeScaled(v, 24);
    await tx
      .update(lotLocationBalances)
      .set({
        quantity: safeQuantity(integer(balance.quantity) + delta),
        revision: balance.revision + 1,
      })
      .where(
        and(
          eq(lotLocationBalances.lotId, leg.lotId),
          eq(lotLocationBalances.locationId, leg.locationId),
        ),
      );
    await tx
      .update(locationStockBalances)
      .set({
        quantity: safeQuantity(integer(locationBalance.quantity) + delta),
      })
      .where(
        and(
          eq(locationStockBalances.itemId, leg.itemId),
          eq(locationStockBalances.locationId, leg.locationId),
        ),
      );
    await tx
      .update(inventoryValuations)
      .set({
        quantity: safeQuantity(valued.quantity),
        value: valued.value === null ? null : six(valued.value),
      })
      .where(
        and(
          eq(inventoryValuations.itemId, leg.itemId),
          eq(inventoryValuations.branchId, ctx.branchId),
        ),
      );
    await tx.insert(stockMovements).values({
      branchId: ctx.branchId,
      operationId: input.operationId,
      documentId: document.id,
      itemId: leg.itemId,
      lotId: leg.lotId,
      locationId: leg.locationId,
      action: input.action,
      quantity: six(delta),
      value: valued.appliedValue === null ? null : six(valued.appliedValue),
      reason: input.reason,
    });
    result.push({
      value: valued.appliedValue === null ? null : six(valued.appliedValue),
    });
  }
  return result;
}
