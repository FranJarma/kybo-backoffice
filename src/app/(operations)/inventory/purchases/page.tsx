import { requireManagerPage as requireActor } from "@/lib/page-access";
import { PurchasesWorkspace } from "@/components/inventory/purchases-workspace";
export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string }>;
}) {
  const actor = await requireActor();
  const { order } = await searchParams;
  const initialOrderId =
    order && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(order)
      ? order
      : undefined;
  return (
    <PurchasesWorkspace
      key={`${actor.id}:${actor.branchId}`}
      actorId={actor.id}
      timeZone={actor.timeZone!}
      initialOrderId={initialOrderId}
    />
  );
}
