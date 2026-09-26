import { getDb } from "@/db/client";
import { createTableService } from "@/modules/sales/tables";
import { salesResponse } from "@/modules/sales/http";
export async function GET() {
  return salesResponse(null, async (actor) =>
    createTableService(await getDb()).list(actor),
  );
}
export async function POST(request: Request) {
  return salesResponse(request, async (actor, input) =>
    createTableService(await getDb()).save(actor, input),
  );
}
