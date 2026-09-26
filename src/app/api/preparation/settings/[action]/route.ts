import { getDb } from "@/db/client";
import { AppError } from "@/lib/errors";
import { createPreparationSettings } from "@/modules/preparation/settings";
import { preparationResponse } from "@/modules/preparation/http";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ action: string }> },
) {
  return preparationResponse(request, async (actor, input) => {
    const { action } = await params,
      service = createPreparationSettings(await getDb());
    if (action === "stations") return service.saveStation(actor, input);
    if (action === "routes") return service.routeProduct(actor, input);
    throw new AppError("NOT_FOUND", "La operación no existe.", 404);
  });
}
