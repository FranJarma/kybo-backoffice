import { getDb } from "@/db/client";
import { salesResponse } from "@/modules/sales/http";
import { createPickupService } from "@/modules/pickup/service";
export async function GET() {
  return salesResponse(null, async (actor) =>
    createPickupService(await getDb()).fleet(actor),
  );
}
