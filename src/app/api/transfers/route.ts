import { z } from "zod";
import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { branches, locations } from "@/db/branch-schema";
import { stockTransfers, transferAllocations } from "@/db/transfer-schema";
import { items } from "@/db/item-schema";
import { operationalActor } from "@/modules/branches/http";
import { createTransferService } from "@/modules/transfers/service";
import { inventoryResponse } from "@/modules/inventory/http";
import { privateJson, errorResponse } from "@/modules/catalog/http";
import { requireCatalogAccess } from "@/lib/access";
export async function GET(request: Request) {
  try {
    const actor = await operationalActor(request);
    requireCatalogAccess(actor);
    const db = await getDb();
    const destinations = await db
      .select({
        id: locations.id,
        name: locations.name,
        branchId: branches.id,
        branchName: branches.name,
      })
      .from(locations)
      .innerJoin(branches, eq(branches.id, locations.branchId))
      .where(and(isNull(branches.archivedAt), isNull(locations.archivedAt)))
      .orderBy(branches.name, locations.name);
    const query = new URL(request.url).searchParams,
      history = query.get("scope") === "history",
      offset = z.coerce
        .number()
        .int()
        .min(0)
        .max(1000000)
        .parse(query.get("offset") ?? 0);
    const page = await db
      .select()
      .from(stockTransfers)
      .where(
        and(
          or(
            eq(stockTransfers.originBranchId, actor.branchId!),
            eq(stockTransfers.destinationBranchId, actor.branchId!),
          ),
          inArray(
            stockTransfers.state,
            history
              ? ["received", "resolved", "cancelled"]
              : ["confirmed", "in_transit"],
          ),
        ),
      )
      .orderBy(stockTransfers.id)
      .limit(101)
      .offset(offset);
    const rows = page.slice(0, 100);
    const allocations = rows.length
      ? await db
          .select({ allocation: transferAllocations, itemName: items.name })
          .from(transferAllocations)
          .innerJoin(items, eq(items.id, transferAllocations.itemId))
          .where(
            inArray(
              transferAllocations.transferId,
              rows.map((r) => r.id),
            ),
          )
      : [];
    return privateJson({
      offset,
      hasMore: page.length > 100,
      branchId: actor.branchId,
      destinations,
      rows: rows.map((row) => ({
        ...row,
        allocations: allocations
          .filter((a) => a.allocation.transferId === row.id)
          .map((a) => ({ ...a.allocation, itemName: a.itemName })),
      })),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  return inventoryResponse(request, async (actor, input) =>
    createTransferService(await getDb()).confirm(actor, actor.branchId!, input),
  );
}
