import type { dailyOperationTasks } from "@/db/daily-operation-schema";
import type { SupplySnapshot } from "./types";
import { addDays, dayStart } from "./engine";
import { quantity } from "@/lib/number-format";
export function supplySuggestions(
  snapshot: SupplySnapshot,
  timeZone: string,
): (typeof dailyOperationTasks.$inferInsert)[] {
  return snapshot.alerts
    .filter((a) => a.status === "action" || a.status === "needs_estimate")
    .map((a) => ({
      branchId: "",
      kind: "purchase",
      needKey: `${a.status === "needs_estimate" ? "supply-config" : "supply"}:${a.itemId}`,
      itemId: a.itemId,
      unit: a.baseUnit,
      locationId: null,
      title:
        a.status === "needs_estimate"
          ? `Configurar consumo de ${a.itemName}`
          : `Comprar ${a.itemName}`,
      quantity: a.status === "needs_estimate" ? null : a.suggestedQuantity,
      urgency: a.urgency!,
      state: a.status === "needs_estimate" ? "blocked" : "pending",
      dueAt: a.orderBy
        ? new Date(dayStart(addDays(a.orderBy, 1), timeZone).getTime() - 1)
        : null,
      reason:
        a.status === "needs_estimate"
          ? "Falta estimar el consumo diario en la ficha del insumo, en Reposición y compras. Sin ese dato no se puede calcular la anticipación."
          : `Cobertura física: ${quantity(a.coverageDays!)} días; proyectada con pedidos: ${quantity(a.projectedCoverageDays!)} días. Disponible: ${quantity(a.availableQuantity, a.baseUnit)}. Pedido con fecha vigente: ${quantity(a.incomingQuantity, a.baseUnit)}. ${a.unconfirmedIncomingQuantity !== "0.000000" ? `Sin llegada confirmada o atrasado: ${quantity(a.unconfirmedIncomingQuantity, a.baseUnit)}; consultá al proveedor. ` : ""}Consumo estimado manual: ${quantity(a.dailyConsumption!, a.baseUnit)}/día. Plazo ${a.leadDays} días + margen ${a.safetyDays}; objetivo ${a.targetDays} días. Tramitar hasta ${a.orderBy!.split("-").reverse().join("/")}. Las llegadas se consideran al final del día; una llegada tardía no cubre un faltante anterior.`,
    }));
}
