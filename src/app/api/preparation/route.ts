import { getDb } from "@/db/client";
import { createPreparationService } from "@/modules/preparation/service";
import { preparationResponse } from "@/modules/preparation/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  return preparationResponse(null, async (actor) => {
    const q = new URL(request.url).searchParams;
    return createPreparationService(await getDb()).list(actor, {
      scope: q.get("scope") || "active",
      stationId: q.get("stationId") || undefined,
      mine: q.get("mine") === "true",
      origin: q.get("origin") || undefined,
      saleId: q.get("saleId") || undefined,
      date: q.get("date") || undefined,
      offset: Number(q.get("offset") || 0),
    });
  });
}
