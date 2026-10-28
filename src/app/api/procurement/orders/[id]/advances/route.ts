import { z } from "zod";
import { getDb } from "@/db/client";
import { inventoryResponse } from "@/modules/inventory/http";
import { recordPurchaseAdvance } from "@/modules/procurement/advances";
export const runtime = "nodejs";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return inventoryResponse(request, async (actor, input) => {
    const { id } = await params;
    return recordPurchaseAdvance(
      await getDb(),
      actor,
      z.uuid().parse(id),
      input,
    );
  });
}
