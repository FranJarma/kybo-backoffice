import { getDb } from "@/db/client";
import { requireActor } from "@/lib/auth";
import {
  errorResponse,
  privateJson,
  requestInput,
} from "@/modules/catalog/http";
import { requireUserAdministrator } from "@/modules/users/service";
import {
  getRecoveryContact,
  saveRecoveryContact,
} from "@/modules/password-recovery/contacts";
type Context = { params: Promise<{ id: string }> };
export const runtime = "nodejs";
export async function GET(_request: Request, context: Context) {
  try {
    const actor = await requireActor(),
      db = await getDb();
    return privateJson(
      await getRecoveryContact(db, actor, (await context.params).id),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request, context: Context) {
  try {
    const actor = await requireActor(),
      db = await getDb();
    await requireUserAdministrator(db, actor);
    return privateJson(
      await saveRecoveryContact(
        db,
        actor,
        (await context.params).id,
        await requestInput(request, 2048),
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
