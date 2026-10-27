import type { SupplyAlert } from "@/modules/supply-alerts/types";
import { quantity } from "@/lib/number-format";
export function PurchaseCalculation({ alert: a }: { alert: SupplyAlert }) {
  const coverage = (v: string | null, atLeast: boolean) =>
    v === null
      ? "Sin estimar"
      : `${atLeast ? "Al menos " : ""}${quantity(v)} días`;
  return (
    <details className="border-y border-line py-3">
      <summary className="min-h-8 cursor-pointer text-sm font-semibold text-blue-700">
        Ver cómo se calcula
      </summary>
      <dl className="mt-3 space-y-3 text-sm">
        {[
          [
            "Consumo diario estimado",
            a.dailyConsumption === null
              ? "Falta estimar"
              : `${quantity(a.dailyConsumption, a.baseUnit)} por día`,
          ],
          ["Entrega + margen", `${a.leadDays} + ${a.safetyDays} días`],
          ["Objetivo de stock", `${a.targetDays} días`],
          ["Cobertura física", coverage(a.coverageDays, a.coverageAtLeast)],
          [
            "Cobertura con pedidos",
            coverage(a.projectedCoverageDays, a.projectedCoverageAtLeast),
          ],
          ["Cantidad sugerida", quantity(a.suggestedQuantity, a.baseUnit)],
        ].map(([label, value]) => (
          <div key={label} className="flex justify-between gap-5">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-semibold text-brand">{value}</dd>
          </div>
        ))}
      </dl>
      {Number(a.unconfirmedIncomingQuantity) > 0 && (
        <p className="mt-4 rounded-lg bg-orange-50 p-3 text-sm text-orange-900">
          {quantity(a.unconfirmedIncomingQuantity, a.baseUnit)} sin fecha
          vigente. Consultá al proveedor; no se usan para cubrir un faltante.
        </p>
      )}
      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Se consideran el consumo estimado, vencimientos y pedidos según su
        llegada. Las entregas llegan al final del día y no cubren un faltante
        anterior.
      </p>
    </details>
  );
}
