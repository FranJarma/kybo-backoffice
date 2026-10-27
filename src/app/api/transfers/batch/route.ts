import { getDb } from "@/db/client";
import { inventoryResponse } from "@/modules/inventory/http";
import { confirmTransferBatch } from "@/modules/transfers/batch";

export async function POST(request: Request) {
  return inventoryResponse(request, async (actor, input) =>
    confirmTransferBatch(await getDb(), actor, actor.branchId!, input),
  );
}
