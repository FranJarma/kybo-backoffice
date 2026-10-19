import { getDb } from "@/db/client";
import { requireActor } from "@/lib/auth";
import {
  privateJson,
  errorResponse,
  requestInput,
} from "@/modules/catalog/http";
import { getCombo, publishCombo } from "@/modules/combos/service";
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return privateJson(
      await getCombo(
        await getDb(),
        await requireActor(),
        (await context.params).id,
      ),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return privateJson(
      await publishCombo(
        await getDb(),
        await requireActor(),
        (await context.params).id,
        await requestInput(request, 100000),
      ),
    );
  } catch (e) {
    return errorResponse(e);
  }
}
