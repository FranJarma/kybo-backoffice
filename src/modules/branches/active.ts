import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { requireOperationalContext } from "./context";
import { listAccessibleBranches } from "./list";

export async function resolveOperationalContext(
  db: AppDb,
  actor: Actor,
  selected: string,
) {
  if (actor.role !== "staff")
    return requireOperationalContext(db, actor, selected);
  // Browser preferences may belong to a previous session. Staff context is server-owned.
  const assigned = await listAccessibleBranches(db, actor);
  const branch = assigned[0];
  if (!branch)
    throw new AppError(
      "BRANCH_ASSIGNMENT_REQUIRED",
      "Pedile al encargado que te asigne una sucursal activa.",
      403,
    );
  return requireOperationalContext(db, actor, branch.id);
}
