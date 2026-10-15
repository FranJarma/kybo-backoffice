import {
  catalogContext,
  privateJson,
  errorResponse,
  requestInput,
} from "@/modules/catalog/http";
import { getDb } from "@/db/client";
import { moveCatalogRecord } from "@/modules/catalog/ordering";
export async function POST(
  request: Request,
  context: { params: Promise<{ entity: string; id: string }> },
) {
  try {
    const params = await context.params;
    const { actor, entity } = await catalogContext(params.entity);
    return privateJson(
      await moveCatalogRecord(
        await getDb(),
        actor,
        entity,
        params.id,
        await requestInput(request),
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
