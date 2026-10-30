import { requireActor } from "@/lib/auth";
import { BranchManager } from "@/components/branches/manager";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
export default async function BranchesPage({
  searchParams,
}: {
  searchParams: Promise<{ branch?: string }>;
}) {
  const actor = await requireActor();
  if (actor.role !== "admin") redirect("/");
  const initialBranchId =
    (await searchParams).branch ??
    (await cookies()).get("kybo-branch")?.value ??
    "";
  return (
    <BranchManager
      key={initialBranchId}
      admin={actor.role === "admin"}
      canEditCatalog={actor.role === "admin" || actor.catalogManager === true}
      initialBranchId={initialBranchId}
    />
  );
}
