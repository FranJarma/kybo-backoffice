import { ZodError } from "zod";
import { getDb } from "@/db/client";
import { requireActor } from "@/lib/auth";
import {
  errorResponse,
  privateJson,
  requestInput,
} from "@/modules/catalog/http";
import {
  listUsers,
  saveUser,
  requireUserAdministrator,
} from "@/modules/users/service";
export async function GET() {
  try {
    return privateJson(await listUsers(await getDb(), await requireActor()));
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const actor = await requireActor(),
      db = await getDb();
    await requireUserAdministrator(db, actor);
    const result = await saveUser(db, actor, await requestInput(request));
    return privateJson({ ...result, snapshot: await listUsers(db, actor) });
  } catch (error) {
    if (error instanceof ZodError)
      return privateJson(
        {
          error: error.issues[0]?.message ?? "Revisá los datos de la cuenta.",
          code: "VALIDATION",
        },
        400,
      );
    return errorResponse(error);
  }
}
