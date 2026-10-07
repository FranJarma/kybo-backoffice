import { and, eq, isNull, or } from "drizzle-orm";
import { getDb } from "@/db/client";
import { branches, branchMemberships } from "@/db/branch-schema";
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
    const rows = await db
      .select({
        id: branches.id,
        code: branches.code,
        name: branches.name,
        timeZone: branches.timeZone,
        revision: branches.revision,
      })
      .from(branches)
      .leftJoin(
        branchMemberships,
        and(
          eq(branchMemberships.branchId, branches.id),
          eq(branchMemberships.userId, actor.id),
          isNull(branchMemberships.revokedAt),
        ),
      )
      .where(
        and(
          isNull(branches.archivedAt),
          actor.role === "admin"
            ? undefined
            : or(
                eq(branchMemberships.role, "manager"),
                eq(branchMemberships.role, "staff"),
              ),
        ),
      )
      .orderBy(branches.name);
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
