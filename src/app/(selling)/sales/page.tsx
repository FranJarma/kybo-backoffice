import { requirePageActor as requireActor } from "@/modules/branches/page-context";
import { SalesManager } from "@/components/sales/sales-manager";
export default async function SalesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const actor = await requireActor(),
    query = await searchParams;
  return (
    <SalesManager
      key={`${actor.branchId}:${query.account ?? ""}:${query.table ?? ""}`}
      actorId={actor.id}
      branchId={actor.branchId!}
      role={actor.role}
      initialAccount={
        typeof query.account === "string" ? query.account : undefined
      }
      initialTable={typeof query.table === "string" ? query.table : undefined}
    />
  );
}
