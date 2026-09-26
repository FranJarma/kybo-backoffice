import { requireActor } from "@/lib/auth";
import type { Actor } from "@/lib/access";
import { salesAccess } from "@/modules/sales/validation";
import {
  privateJson,
  requestInput,
  errorResponse,
} from "@/modules/catalog/http";
export async function preparationResponse(
  request: Request | null,
  action: (actor: Actor, input: unknown) => Promise<unknown>,
) {
  try {
    const actor = await requireActor();
    salesAccess(actor);
    return privateJson(
      await action(actor, request ? await requestInput(request) : undefined),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
