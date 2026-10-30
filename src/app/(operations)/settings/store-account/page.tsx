import { redirect } from "next/navigation";
import { requireActor } from "@/lib/auth";
import { getDb } from "@/db/client";
import { listAccessibleBranches } from "@/modules/branches/list";
import { StoreAccountForm } from "@/components/workplace/store-account";
export default async function StoreAccountPage() {
  const actor = await requireActor();
  if (actor.role !== "admin" || actor.accountKind === "store")
    redirect("/sales");
  const branches = await listAccessibleBranches(await getDb(), actor);
  return (
    <StoreAccountForm
      branches={branches.map((b) => ({ id: b.id, name: b.name }))}
    />
  );
}
