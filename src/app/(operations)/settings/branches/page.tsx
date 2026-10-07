import { requireActor } from "@/lib/auth";
import { BranchManager } from "@/components/branches/manager";
export default async function BranchesPage() {
  const actor = await requireActor();
  return (
    <BranchManager
      admin={actor.role === "admin"}
      canEditCatalog={actor.role === "admin" || actor.catalogManager === true}
    />
  );
}
