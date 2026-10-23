import { z } from "zod";
import { getDb } from "@/db/client";
import { inventoryResponse } from "@/modules/inventory/http";
import { getOrderSnapshot } from "@/modules/procurement/queries";
import { commandPurchaseOrder } from "@/modules/procurement/orders";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  return inventoryResponse(null, async (actor) => {
    const { id } = await params;
    const data = await getOrderSnapshot(
      await getDb(),
      actor,
      z.uuid().parse(id),
    );
    return { available: data.available, order: data.orders[0] ?? null };
  });
}
export async function POST(request: Request, { params }: Context) {
  return inventoryResponse(request, async (actor, input) => {
    const { id } = await params;
    return commandPurchaseOrder(
      await getDb(),
      actor,
      z.uuid().parse(id),
      input,
    );
  });
}
