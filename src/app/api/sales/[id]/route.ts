import { getDb } from "@/db/client";
import { createSalesService } from "@/modules/sales/service";
import { salesResponse } from "@/modules/sales/http";
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  return salesResponse(null, async (actor) =>
    createSalesService(await getDb()).get(actor, (await params).id),
  );
}
