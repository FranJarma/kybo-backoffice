import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { requireOperationalContext } from "./context";
import { listAccessibleBranches } from "./list";
import { getStoreProfile } from "@/modules/workplace/access";

export async function resolveOperationalContext(
  db: AppDb,
  actor: Actor,
  selected: string,
  options: { explicit?: boolean } = {},
) {
  // Explicit targets apply to personal staff too; never substitute another branch.
  if (options.explicit) return requireOperationalContext(db, actor, selected);
  const store = await getStoreProfile(db, actor.id);
  if (store || actor.accountKind === "store")
    return requireOperationalContext(
      db,
      actor,
      store?.branchId ?? actor.storeBranchId ?? "",
    );
  if (actor.role !== "staff") {
    // An explicit API target must never silently become a different branch.
    if (selected) {
      try {
        return await requireOperationalContext(db, actor, selected);
      } catch (error) {
        if (
          !(error instanceof AppError) ||
          !["BRANCH_REQUIRED", "BRANCH_UNAVAILABLE", "FORBIDDEN"].includes(
            error.code,
          )
        )
          throw error;
      }
    }
  }
  // Missing or stale browser preferences resolve to a server-authorized default.
  const assigned = await listAccessibleBranches(db, actor);
  const branch = assigned[0];
  if (!branch) {
    if (actor.role === "admin")
      throw new AppError(
        "BRANCH_REQUIRED",
        "Creá una sucursal para empezar a operar.",
        400,
      );
    throw new AppError(
      "BRANCH_ASSIGNMENT_REQUIRED",
      "Pedile al administrador que te asigne una sucursal activa.",
      403,
    );
  }
  return requireOperationalContext(db, actor, branch.id);
}
