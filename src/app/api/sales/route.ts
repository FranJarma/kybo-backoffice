import { getDb } from "@/db/client";
import { createSalesService } from "@/modules/sales/service";
import { salesResponse } from "@/modules/sales/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return salesResponse(null, async (actor) => {
    const query = new URL(request.url).searchParams;
    return createSalesService(await getDb()).list(actor, {
      origin: query.get("origin") || undefined,
      status: query.get("status") || undefined,
      date: query.get("date") || undefined,
      q: query.get("q") || "",
      offset: Number(query.get("offset") || 0),
    });
  });
}
export async function POST(request: Request) {
  return salesResponse(request, async (actor, input) =>
    createSalesService(await getDb()).create(actor, input),
  );
}
