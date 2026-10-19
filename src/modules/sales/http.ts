import { operationalActor } from "@/modules/branches/http";
import type { Actor } from "@/lib/access";
import {
  privateJson,
  requestInput,
  errorResponse,
} from "@/modules/catalog/http";
import { salesAccess } from "./validation";
import { salesVisibility } from "./visibility";
export async function salesResponse(
  request: Request | null,
  action: (actor: Actor, input: unknown) => Promise<unknown>,
) {
  try {
    const actor = await operationalActor(request);
    salesAccess(actor);
    return privateJson(
      salesVisibility(
        actor,
        await action(
          actor,
          request ? await requestInput(request, 300000) : undefined,
        ),
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
