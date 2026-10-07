import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { branches, locations } from "@/db/branch-schema";
import { operationalContext } from "@/modules/branches/http";
import { privateJson, errorResponse } from "@/modules/catalog/http";
export async function GET(request: Request) {
  try {
    const ctx = await operationalContext(request),
      db = await getDb();
    const [branch] = await db
      .select()
      .from(branches)
      .where(eq(branches.id, ctx.branchId));
    const rows = await db
      .select({ id: locations.id, name: locations.name, code: locations.code })
      .from(locations)
      .where(
        and(eq(locations.branchId, ctx.branchId), isNull(locations.archivedAt)),
      )
      .orderBy(locations.name);
    return privateJson({ branch, locations: rows, role: ctx.role });
  } catch (error) {
    return errorResponse(error);
  }
}
