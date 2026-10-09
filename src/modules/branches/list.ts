import { and, eq, isNull, or } from "drizzle-orm";
import { branches, branchMemberships } from "@/db/branch-schema";
import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";

export async function listAccessibleBranches(db: AppDb, actor: Actor) {
  return db
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
}
