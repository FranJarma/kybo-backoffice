import { getDb } from "@/db/client";
import { salesResponse } from "@/modules/sales/http";
import { createPickupService } from "@/modules/pickup/service";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  return salesResponse(null, async (actor) =>
    createPickupService(await getDb()).history(actor, (await params).id),
  );
}
export async function POST(request: Request, { params }: Context) {
  return salesResponse(request, async (actor, input) =>
    createPickupService(await getDb()).change(actor, (await params).id, input),
  );
}
