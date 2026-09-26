import { getDb } from "@/db/client";
import { createPreparationService } from "@/modules/preparation/service";
import { preparationResponse } from "@/modules/preparation/http";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: Context) {
  return preparationResponse(null, async (actor) =>
    createPreparationService(await getDb()).get(actor, (await params).id),
  );
}
export async function POST(request: Request, { params }: Context) {
  return preparationResponse(request, async (actor, input) =>
    createPreparationService(await getDb()).act(
      actor,
      (await params).id,
      input,
    ),
  );
}
