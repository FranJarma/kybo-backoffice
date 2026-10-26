import { and, eq, isNull, ne, sql } from "drizzle-orm";
import type { Tx } from "@/db/types";
import { locatorAssignments } from "@/db/pickup-schema";
import { saleLines } from "@/db/sales-schema";
import { saleLineFulfillments } from "@/db/fulfillment-event-schema";
import type { OperationalContext } from "../operations/types";
import { audit } from "../inventory/service";

export const locatorLockKey = (branchId: string) =>
  `pickup:${branchId.toLowerCase()}`;

/** The caller holds the sale lock, serializing deliveries and assignment changes. */
export async function returnDeliveredLocator(
  tx: Tx,
  ctx: OperationalContext,
  orderId: string,
) {
  const lines = await tx
    .select({ progress: saleLineFulfillments })
    .from(saleLines)
    .leftJoin(
      saleLineFulfillments,
      and(
        eq(saleLineFulfillments.saleLineId, saleLines.id),
        eq(saleLineFulfillments.branchId, ctx.branchId),
      ),
    )
    .where(
      and(
        eq(saleLines.orderId, orderId),
        eq(saleLines.branchId, ctx.branchId),
        ne(saleLines.lineKind, "combo"),
      ),
    );
  if (
    !lines.length ||
    lines.some(
      ({ progress }) =>
        !progress ||
        progress.delivered + progress.cancelled !== progress.ordered,
    )
  )
    return;

  // Match assignment writers: take the fleet lock before changing a held number.
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${locatorLockKey(ctx.branchId)}, 0))`,
  );
  const [returned] = await tx
    .update(locatorAssignments)
    .set({ returnedAt: new Date(), returnedBy: ctx.actorId })
    .where(
      and(
        eq(locatorAssignments.orderId, orderId),
        eq(locatorAssignments.branchId, ctx.branchId),
        isNull(locatorAssignments.returnedAt),
      ),
    )
    .returning({
      id: locatorAssignments.id,
      number: locatorAssignments.number,
    });
  if (returned)
    await audit(
      tx,
      { id: ctx.actorId, role: ctx.role, branchId: ctx.branchId },
      "sale-orders",
      orderId,
      "locator-return-on-delivery",
      { assignmentId: returned.id, number: returned.number },
    );
}
