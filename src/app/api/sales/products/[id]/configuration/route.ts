import { getDb } from "@/db/client";
import { salesResponse } from "@/modules/sales/http";
import { getProductConfiguration } from "@/modules/recipes/configuration";
import { channelSchema, parse } from "@/modules/sales/validation";
import { recipeId } from "@/modules/recipes/service";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return salesResponse(null, async (actor) => {
    const { id } = await context.params;
    recipeId(id);
    return getProductConfiguration(
      await getDb(),
      actor,
      id,
      parse(
        channelSchema,
        new URL(request.url).searchParams.get("channel") ?? "counter",
      ),
    );
  });
}
