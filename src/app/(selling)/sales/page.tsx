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
      key={`${query.account ?? ""}:${query.table ?? ""}`}
      actorId={actor.id}
      role={actor.role}
      initialAccount={
        typeof query.account === "string" ? query.account : undefined
      }
      initialTable={typeof query.table === "string" ? query.table : undefined}
    />
  );
}
