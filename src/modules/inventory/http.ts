import { requireCatalogAccess, type Actor } from "@/lib/access";
import { operationalActor } from "@/modules/branches/http";
import {
  errorResponse,
  privateJson,
  requestInput,
} from "@/modules/catalog/http";

export async function inventoryResponse(
  request: Request | null,
  action: (actor: Actor, input: unknown) => Promise<unknown>,
): Promise<Response> {
  try {
    const actor = await operationalActor(request);
    requireCatalogAccess(actor);
    const input = request ? await requestInput(request) : undefined;
    return privateJson(await action(actor, input));
  } catch (error) {
    return errorResponse(error);
  }
}
