import { redirect } from "next/navigation";
import { operationalActor } from "./http";
import { AppError } from "@/lib/errors";
import type { Actor } from "@/lib/access";
/** Pages redirect to branch selection; APIs return an explicit access error. */
export async function requirePageActor() {
  try {
    return await operationalActor();
  } catch (error) {
    if (
      error instanceof AppError &&
      ["BRANCH_REQUIRED", "BRANCH_UNAVAILABLE", "FORBIDDEN"].includes(
        error.code,
      )
    )
      redirect("/settings/branches");
    throw error;
  }
}
export async function shellActor(actor: Actor): Promise<Actor> {
  try {
    return { ...actor, ...(await operationalActor()) };
  } catch (error) {
    if (
      error instanceof AppError &&
      ["BRANCH_REQUIRED", "BRANCH_UNAVAILABLE", "FORBIDDEN"].includes(
        error.code,
      )
    )
      return { ...actor, role: actor.role === "admin" ? "admin" : "staff" };
    throw error;
  }
}
