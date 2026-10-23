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
          ? `Configurar consumo de ${a.itemName} · Bolivia`
          : `Comprar ${a.itemName} · Bolivia`,
      quantity: a.status === "needs_estimate" ? null : a.suggestedQuantity,
      urgency: a.urgency!,
      state: a.status === "needs_estimate" ? "blocked" : "pending",
      dueAt: a.orderBy
        ? new Date(dayStart(addDays(a.orderBy, 1), timeZone).getTime() - 1)
        : null,
      reason:
        a.status === "needs_estimate"
          ? "Falta estimar el consumo diario en Inventario → Compras de Bolivia. Sin ese dato no se puede calcular la anticipación."
          : `Bolivia · Cobertura aproximada: ${quantity(a.coverageDays!)} días. Disponible en la sucursal: ${quantity(a.availableQuantity, a.baseUnit)}. Consumo estimado manual: ${quantity(a.dailyConsumption!, a.baseUnit)}/día. Plazo ${a.leadDays} días + margen ${a.safetyDays}; objetivo ${a.targetDays} días. Tramitar hasta ${a.orderBy!.split("-").reverse().join("/")}. Calculado con stock recibido y vencimientos. Revisá pedidos en trámite antes de comprar.`,
    }));
}
