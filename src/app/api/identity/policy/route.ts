import { getDb } from "@/db/client";
import { operationalActor } from "@/modules/branches/http";
import { privateJson, errorResponse } from "@/modules/catalog/http";
import { identityRequired } from "@/modules/identity/confirmation";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try {
    const actor = await operationalActor(request);
    return privateJson({
      branchId: actor.branchId!,
      required: await identityRequired(await getDb(), actor.branchId!),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
