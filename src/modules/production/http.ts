import type { Actor } from "@/lib/access";
import { operationalActor } from "@/modules/branches/http";
import {
  errorResponse,
  privateJson,
  requestInput,
} from "@/modules/catalog/http";

export async function productionResponse(
  request: Request,
  action: (actor: Actor, input: unknown) => Promise<unknown>,
): Promise<Response> {
  try {
    const actor = await operationalActor(request);
    const input =
      request.method === "GET" ? undefined : await requestInput(request);
    return privateJson(await action(actor, input));
  } catch (error) {
    return errorResponse(error);
  }
}
