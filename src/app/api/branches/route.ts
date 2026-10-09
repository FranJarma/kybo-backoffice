import { getDb } from "@/db/client";
import { listAccessibleBranches } from "@/modules/branches/list";
import { requireActor } from "@/lib/auth";
import { createBranch } from "@/modules/branches/service";
import {
  privateJson,
  errorResponse,
  requestInput,
} from "@/modules/catalog/http";
export async function GET() {
  try {
    const actor = await requireActor(),
      db = await getDb();
    const rows = await listAccessibleBranches(db, actor);
    return privateJson({ rows });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    return privateJson(
      await createBranch(
        await getDb(),
        await requireActor(),
        await requestInput(request),
      ),
      201,
    );
  } catch (error) {
    return errorResponse(error);
  }
}
