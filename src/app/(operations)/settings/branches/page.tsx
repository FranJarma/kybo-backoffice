import { requireActor } from "@/lib/auth";
import { BranchManager } from "@/components/branches/manager";
import { redirect } from "next/navigation";
export default async function BranchesPage() {
  const actor = await requireActor();
  if (actor.role !== "admin") redirect("/");
  return (
    <BranchManager
      admin={actor.role === "admin"}
      canEditCatalog={actor.role === "admin" || actor.catalogManager === true}
    />
  );
}
