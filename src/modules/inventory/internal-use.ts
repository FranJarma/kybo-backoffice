import type { Tx } from "@/db/types";
import type { OperationalContext, StockAllocation } from "../operations/types";
import { internalUses, stockDocuments } from "@/db/inventory-document-schema";
import { postMovement } from "./ledger";
import { AppError } from "@/lib/errors";
import { lockStock } from "./locking";
export async function recordInternalUse(
  tx: Tx,
  ctx: OperationalContext,
  input: {
    operationId: string;
    allocations: StockAllocation[];
    reason: string;
  },
) {
  if (ctx.role === "staff")
    throw new AppError("FORBIDDEN", "Se requiere permiso de encargado.", 403);
  if (
    !input.reason.trim() ||
    input.reason.length > 2000 ||
    !input.allocations.length
  )
    throw new AppError(
      "VALIDATION",
      "Indicá artículos, cantidades y motivo del consumo.",
      400,
    );
  await lockStock(tx, ctx, input.allocations);
  const [use] = await tx
    .insert(internalUses)
    .values({
      branchId: ctx.branchId,
      actorId: ctx.actorId,
      reason: input.reason.trim(),
    })
    .returning();
  const [document] = await tx
    .insert(stockDocuments)
    .values({
      branchId: ctx.branchId,
      kind: "internal_use",
      internalUseId: use.id,
    })
    .returning();
  await postMovement(tx, ctx, {
    operationId: input.operationId,
    documentId: document.id,
    action: "internal_use",
    reason: input.reason,
    legs: input.allocations.map((a) => ({
      ...a,
      direction: "out",
      incomingValue: null,
    })),
  });
  return { id: use.id };
}
