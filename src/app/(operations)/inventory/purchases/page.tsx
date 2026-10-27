import { requireManagerPage as requireActor } from "@/lib/page-access";
import { PurchasesWorkspace } from "@/components/inventory/purchases-workspace";
import { getDb } from "@/db/client";
import { getSupplySnapshot } from "@/modules/supply-alerts/service";
import { purchaseSeed } from "@/modules/supply-alerts/presentation";
export default async function PurchasesPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string; item?: string }>;
}) {
  const actor = await requireActor();
  const { order, item } = await searchParams;
  const initialOrderId =
    order && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(order)
      ? order
      : undefined;
  const itemId =
    item && /^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(item)
      ? item
      : undefined;
  const supply =
    itemId && !initialOrderId
      ? await getSupplySnapshot(await getDb(), actor)
      : null;
  const alert = supply?.alerts.find((a) => a.itemId === itemId);
  const lines = alert ? purchaseSeed([alert]) : [];
  return (
    <PurchasesWorkspace
      key={`${actor.id}:${actor.branchId}`}
      actorId={actor.id}
      timeZone={actor.timeZone!}
      initialOrderId={initialOrderId}
      initialLines={lines.length ? lines : undefined}
      initialConfigurationId={
        alert?.status === "needs_estimate" ? itemId : undefined
      }
      initialNotice={
        itemId &&
        !initialOrderId &&
        !lines.length &&
        alert?.status !== "needs_estimate"
          ? "La necesidad cambió o ya está cubierta. Revisá las cantidades actuales antes de preparar otro pedido."
          : undefined
      }
    />
  );
}
