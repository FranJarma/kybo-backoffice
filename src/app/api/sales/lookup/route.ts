import { getDb } from "@/db/client";
import { createSalesService } from "@/modules/sales/service";
import { salesResponse } from "@/modules/sales/http";
export async function GET(request: Request) {
  return salesResponse(null, async (actor) => {
    const q = new URL(request.url).searchParams;
    return createSalesService(await getDb()).lookup(
      actor,
      q.get("kind") ?? "products",
      q.get("q") ?? "",
      q.get("channel") ?? "counter",
      q.get("category") ?? "",
      Number(q.get("offset") ?? 0),
    );
  });
}
