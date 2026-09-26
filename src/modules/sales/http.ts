import { requireActor } from "@/lib/auth";
import type { Actor } from "@/lib/access";
import {
  privateJson,
  requestInput,
  errorResponse,
} from "@/modules/catalog/http";
import { salesAccess } from "./validation";
export async function salesResponse(
  request: Request | null,
  action: (actor: Actor, input: unknown) => Promise<unknown>,
) {
  try {
    const actor = await requireActor();
    salesAccess(actor);
    return privateJson(
      await action(
        actor,
        request ? await requestInput(request, 300000) : undefined,
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
