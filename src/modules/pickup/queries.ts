import { and, asc, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { branches } from "@/db/branch-schema";
import { locatorAssignments } from "@/db/pickup-schema";
import { saleLines, saleOrders, sales } from "@/db/sales-schema";
import { saleLineFulfillments } from "@/db/fulfillment-event-schema";
import { preparationTasks } from "@/db/preparation-schema";
import { notFound } from "@/modules/inventory/service";
import { parse, uuid } from "@/modules/sales/validation";
import { pickupState } from "./state";
import type { PublicQueue } from "./types";

export async function publicQueue(
  db: AppDb,
  key: string,
  offset = 0,
): Promise<PublicQueue> {
  parse(uuid, key);
  // One snapshot prevents mixing a task's old state with newer line quantities.
  return db.transaction(
    async (tx) => {
      const [branch] = await tx
        .select({ id: branches.id, name: branches.name })
        .from(branches)
        .where(
          and(eq(branches.publicQueueKey, key), isNull(branches.archivedAt)),
        );
      if (!branch) notFound();
      const orders = await tx
        .select({
          id: saleOrders.id,
          number: sales.number,
          sequence: saleOrders.sequence,
          locatorNumber: locatorAssignments.number,
          customerName: sales.customerName,
        })
        .from(saleOrders)
        .innerJoin(sales, eq(sales.id, saleOrders.saleId))
        .leftJoin(
          locatorAssignments,
          and(
            eq(locatorAssignments.orderId, saleOrders.id),
            isNull(locatorAssignments.returnedAt),
          ),
        )
        .where(
          and(
            eq(saleOrders.branchId, branch.id),
            ne(sales.status, "cancelled"),
            // Start from indexed outstanding work, not every historical order.
            // Legacy sales without operational progress must not reappear here.
            sql`${saleOrders.id} in (
              select l.order_id from sale_line_fulfillments f
              join sale_lines l on l.id = f.sale_line_id
              where f.branch_id = ${branch.id} and f.delivered + f.cancelled < f.ordered
              union
              select t.order_id from preparation_tasks t
              where t.branch_id = ${branch.id} and t.status in ('pending','preparing','ready')
            )`,
          ),
        )
        .orderBy(asc(saleOrders.createdAt), asc(saleOrders.id))
        .limit(10)
        .offset(offset);
      const page = orders.slice(0, 9),
        ids = page.map((o) => o.id);
      if (!ids.length)
        return { branchName: branch.name, rows: [], nextOffset: 0 };
      const lines = await tx
        .select({ orderId: saleLines.orderId, progress: saleLineFulfillments })
        .from(saleLines)
        .leftJoin(
          saleLineFulfillments,
          eq(saleLineFulfillments.saleLineId, saleLines.id),
        )
        .where(
          and(inArray(saleLines.orderId, ids), ne(saleLines.lineKind, "combo")),
        );
      const tasks = await tx
        .select({
          orderId: preparationTasks.orderId,
          status: preparationTasks.status,
        })
        .from(preparationTasks)
        .where(inArray(preparationTasks.orderId, ids));
      return {
        branchName: branch.name,
        nextOffset: orders.length > 9 ? offset + 9 : 0,
        rows: page
          .map((o) => ({
            label: `${o.number}.${o.sequence}`,
            locatorNumber: o.locatorNumber,
            customerName: o.customerName?.trim() || null,
            state: pickupState(
              "open",
              lines.filter((l) => l.orderId === o.id).map((l) => l.progress),
              tasks.filter((t) => t.orderId === o.id).map((t) => t.status),
            ),
          }))
          .filter((r) => r.state === "preparing" || r.state === "ready"),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
