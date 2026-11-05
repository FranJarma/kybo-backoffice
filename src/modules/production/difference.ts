import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import { auditEvents } from "@/db/business-schema";
import { productionOrders } from "@/db/production-order-schema";
import { AppError } from "@/lib/errors";
import type { OperationalContext } from "../operations/types";
import { lockedProduction, productionExecutor } from "./access";
import { integer, six } from "../inventory/decimal";

const amount = z.string().regex(/^\d{1,12}\.\d{6}$/);
const differenceSchema = z.object({
  actualQuantity: amount,
  reason: z.string().trim().min(1).max(2000),
  revision: z.number().int().positive(),
  reportedBy: z.string().min(1),
  reportedAt: z.iso.datetime(),
});
export type ProductionDifference = z.infer<typeof differenceSchema>;

export async function productionDifferences(db: AppDb | Tx, ids: string[]) {
  const result = new Map<string, ProductionDifference>();
  if (!ids.length) return result;
  const events = await db
    .select({ id: auditEvents.recordId, after: auditEvents.after })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.entity, "production-orders"),
        eq(auditEvents.action, "report-difference"),
        inArray(auditEvents.recordId, ids),
      ),
    );
  for (const event of events) {
    const parsed = differenceSchema.safeParse(event.after);
    if (
      parsed.success &&
      parsed.data.revision > (result.get(event.id)?.revision ?? 0)
    )
      result.set(event.id, parsed.data);
  }
  return result;
}

export async function reportProductionDifference(
  tx: Tx,
  ctx: OperationalContext,
  operationId: string,
  id: string,
  raw: unknown,
) {
  const input = z
    .object({
      expectedRevision: z.number().int().positive(),
      actualQuantity: amount,
      reason: z.string().trim().min(1).max(2000),
    })
    .strict()
    .parse(raw);
  const order = await lockedProduction(tx, ctx, id, input.expectedRevision);
  productionExecutor(ctx, order.assignedTo);
  if (order.state !== "confirmed")
    throw new AppError(
      "PRODUCTION_CONFLICT",
      "Solo podés informar diferencias de una producción en curso.",
      409,
    );
  const revision = order.revision + 1;
  // This is an employee report, not a stock result. The reservation stays open
  // until a manager confirms the actual consumption and output in finishProduction.
  await tx
    .update(productionOrders)
    .set({ revision })
    .where(eq(productionOrders.id, id));
  await tx.insert(auditEvents).values({
    actorId: ctx.actorId,
    entity: "production-orders",
    recordId: id,
    action: "report-difference",
    after: {
      operationId,
      revision,
      actualQuantity: six(integer(input.actualQuantity)),
      reason: input.reason,
      reportedBy: ctx.actorId,
      reportedAt: new Date().toISOString(),
    },
  });
  return { id, revision };
}
