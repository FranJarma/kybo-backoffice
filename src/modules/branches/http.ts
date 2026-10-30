import { headers, cookies } from "next/headers";
import { getDb } from "@/db/client";
import { requireActor } from "@/lib/auth";
import { resolveOperationalContext } from "./active";
import type { Actor } from "@/lib/access";
import { assertStoreHttpAccess } from "./store-access";
export async function operationalContext(request: Request | null = null) {
  const actor = await requireActor();
  const source = request?.headers ?? (await headers());
  const explicitBranch = source.get("X-Kybo-Branch-Id");
  const branchId =
    explicitBranch ?? (await cookies()).get("kybo-branch")?.value ?? "";
  const ctx = await resolveOperationalContext(await getDb(), actor, branchId, {
    explicit: explicitBranch !== null,
  });
  if (request) assertStoreHttpAccess(ctx, request);
  return ctx;
}
export async function operationalActor(
  request: Request | null = null,
): Promise<Actor> {
  const ctx = await operationalContext(request);
  return {
    id: ctx.actorId,
    role: ctx.role,
    branchId: ctx.branchId,
    timeZone: ctx.timeZone,
    sessionId: ctx.sessionId,
    accountKind: ctx.accountKind,
    storeBranchId: ctx.accountKind === "store" ? ctx.branchId : undefined,
  };
}
