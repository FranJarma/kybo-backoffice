import { and, eq, inArray, ne } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { productionOrders } from "@/db/production-order-schema";
import { stockDocuments } from "@/db/inventory-document-schema";
import {
  reservationAllocations,
  stockReservations,
} from "@/db/reservation-schema";
import { items } from "@/db/item-schema";
import { inventoryResponse } from "@/modules/inventory/http";
import { executeCommand } from "@/modules/operations/command";
import { confirmProduction } from "@/modules/production/orders";
import { integer, six } from "@/modules/inventory/decimal";
export async function GET(request: Request) {
  return inventoryResponse(null, async (actor) => {
    const db = await getDb();
    const query = new URL(request.url).searchParams;
    const offset = z.coerce
      .number()
      .int()
      .min(0)
      .max(1_000_000)
      .parse(query.get("offset") ?? 0);
    const history = query.get("scope") === "history";
    const page = await db
      .select({
        order: productionOrders,
        name: items.name,
        baseUnit: items.baseUnit,
      })
      .from(productionOrders)
      .innerJoin(items, eq(items.id, productionOrders.outputItemId))
      .where(
        and(
          eq(productionOrders.branchId, actor.branchId!),
          history
            ? ne(productionOrders.state, "confirmed")
            : eq(productionOrders.state, "confirmed"),
        ),
      )
      .orderBy(productionOrders.id)
      .limit(101)
      .offset(offset);
    const rows = page.slice(0, 100);
    const allocations = rows.length
      ? await db
          .select({
            orderId: stockDocuments.productionOrderId,
            a: reservationAllocations,
            name: items.name,
            baseUnit: items.baseUnit,
          })
          .from(stockDocuments)
          .innerJoin(
            stockReservations,
            eq(stockReservations.documentId, stockDocuments.id),
          )
          .innerJoin(
            reservationAllocations,
            eq(reservationAllocations.reservationId, stockReservations.id),
          )
          .innerJoin(items, eq(items.id, reservationAllocations.itemId))
          .where(
            and(
              eq(stockDocuments.branchId, actor.branchId!),
              inArray(
                stockDocuments.productionOrderId,
                rows.map((r) => r.order.id),
              ),
            ),
          )
      : [];
    return {
      offset,
      hasMore: page.length > 100,
      rows: rows.map((r) => {
        const components = new Map<
          string,
          { itemId: string; name: string; baseUnit: string; reserved: string }
        >();
        for (const row of allocations.filter((a) => a.orderId === r.order.id)) {
          const prior = components.get(row.a.itemId);
          components.set(row.a.itemId, {
            itemId: row.a.itemId,
            name: row.name,
            baseUnit: row.baseUnit,
            reserved: six(
              integer(prior?.reserved ?? "0") +
                integer(row.a.allocated) -
                integer(row.a.consumed) -
                integer(row.a.released),
            ),
          });
        }
        return {
          ...r.order,
          name: r.name,
          baseUnit: r.baseUnit,
          components: [...components.values()],
        };
      }),
    };
  });
}
export async function POST(request: Request) {
  return inventoryResponse(request, async (actor, raw) => {
    const input = z
      .object({ requestId: z.uuid(), order: z.unknown() })
      .strict()
      .parse(raw);
    return executeCommand(
      await getDb(),
      actor,
      actor.branchId!,
      input,
      "production-confirm",
      input,
      (tx, ctx, operationId) =>
        confirmProduction(tx, ctx, operationId, input.order),
    );
  });
}
