import { getDb } from "@/db/client";
import { catalogResponse } from "@/modules/catalog/http";
import { createProductGroupService } from "@/modules/combos/product-groups";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, context: Context) {
  return catalogResponse(null, async (actor) =>
    createProductGroupService(await getDb()).get(
      actor,
      (await context.params).id,
      new URL(request.url).searchParams.get("version") ?? undefined,
    ),
  );
}
export async function PATCH(request: Request, context: Context) {
  return catalogResponse(request, async (actor, input) =>
    createProductGroupService(await getDb()).archive(
      actor,
      (await context.params).id,
      input,
    ),
  );
}
