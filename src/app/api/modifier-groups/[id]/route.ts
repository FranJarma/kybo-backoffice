import { getDb } from "@/db/client";
import { catalogResponse as inventoryResponse } from "@/modules/catalog/http";
import { createModifierService } from "@/modules/modifiers/service";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return inventoryResponse(null, async (actor) =>
    createModifierService(await getDb()).get(
      actor,
      (await context.params).id,
      new URL(request.url).searchParams.get("version") ?? undefined,
    ),
  );
}
export async function PATCH(request: Request, context: Context) {
  return inventoryResponse(request, async (actor, input) =>
    createModifierService(await getDb()).archive(
      actor,
      (await context.params).id,
      input,
    ),
  );
}
