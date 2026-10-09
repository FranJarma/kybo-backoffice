import { getDb } from "@/db/client";
import { createPreparationSettings } from "@/modules/preparation/settings";
import { preparationResponse } from "@/modules/preparation/http";
export async function GET(request: Request) {
  return preparationResponse(null, async (actor) => {
    const q = new URL(request.url).searchParams;
    return createPreparationSettings(await getDb()).list(actor, {
      productId: q.get("productId") || undefined,
      q: q.get("q") || "",
      includeArchived: q.get("includeArchived") === "true",
      offset: Number(q.get("offset") || 0),
    });
  });
}
