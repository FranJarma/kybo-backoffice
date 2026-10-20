"use client";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { money, quantity } from "@/lib/number-format";
import { allocateOverhead } from "@/modules/overheads/calculation";
import type {
  ProfitabilityData,
  estimateProfitability,
} from "@/modules/pricing/product-profitability";

export function CostingBreakdown({
  data,
  estimate,
}: {
  data: ProfitabilityData;
  estimate: ReturnType<typeof estimateProfitability>;
}) {
  const overhead = data.overhead;
  const expensesUrl = `/finance/expenses${overhead?.month ? `?month=${overhead.month}` : ""}`;
  return (
    <div className="space-y-3">
      <section aria-label="Impuestos" className="rounded-xl border border-line">
        <details className="group">
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block text-sm font-semibold">Impuestos</span>
              <span className="mt-1 block text-xs text-muted">
                IVA{" "}
                {data.vatRate === null
                  ? "pendiente"
                  : `${quantity(data.vatRate)}%`}{" "}
                · IIBB{" "}
                {overhead?.iibbRate == null
                  ? "pendiente"
                  : `${quantity(overhead.iibbRate)}%`}
              </span>
            </span>
            <ChevronDown
              size={18}
              aria-hidden="true"
              className="shrink-0 transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="space-y-3 border-t border-line px-4 py-4 text-xs leading-relaxed text-muted">
            <p>
              El IVA ya está incluido en el precio al cliente. La venta sin IVA
              es{" "}
              <strong className="text-brand">{money(estimate.netPrice)}</strong>
              .
            </p>
            <p>
              IIBB se estima sobre la venta sin IVA, con la alícuota efectiva
              confirmada para la sucursal y el mes. El IVA mostrado corresponde
              a esta venta; el saldo fiscal también depende de los créditos de
              compras.
            </p>
            <Link
              className="inline-block py-1 text-blue underline underline-offset-4"
              href={expensesUrl}
            >
              Configurar IIBB del mes
            </Link>
          </div>
        </details>
      </section>
      <section
        aria-label="Gastos fijos y generales"
        className="rounded-xl border border-line"
      >
        <details className="group">
          <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
            <span>
              <span className="block text-sm font-semibold">
                Gastos fijos y generales
              </span>
              <span className="mt-1 block text-xs text-muted">
                {overhead?.month ?? "Mes sin configurar"} · Presupuesto mensual
              </span>
            </span>
            <ChevronDown
              size={18}
              aria-hidden="true"
              className="shrink-0 transition-transform group-open:rotate-180"
            />
          </summary>
          <div className="space-y-3 border-t border-line px-4 py-4 text-xs leading-relaxed text-muted">
            <p>
              {overhead?.budgetTotal != null && overhead.expectedUnits
                ? `${money(overhead.budgetTotal)} / ${quantity(String(overhead.expectedUnits))} unidades previstas. ${data.finalUnits == null ? "Cantidad de componentes pendiente." : `Esta venta representa ${quantity(String(data.finalUnits))} ${data.finalUnits === 1 ? "unidad final" : "unidades finales"}.`}`
                : "Completá los gastos del mes y las unidades previstas para calcular cuánto corresponde a cada venta."}
            </p>
            {!!overhead?.entries?.length && (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-line">
                      <th scope="col" className="py-2 font-medium">
                        Gasto
                      </th>
                      <th scope="col" className="px-3 text-right font-medium">
                        Mes
                      </th>
                      <th scope="col" className="text-right font-medium">
                        Por venta
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {overhead.entries.map((entry, index) => (
                      <tr
                        key={index}
                        className="border-b border-line/60 last:border-0"
                      >
                        <th scope="row" className="py-3 pr-2 font-normal">
                          {entry.concept}
                        </th>
                        <td className="px-3 text-right whitespace-nowrap tabular-nums">
                          {money(entry.budget)}
                        </td>
                        <td className="text-right whitespace-nowrap tabular-nums">
                          {money(
                            data.finalUnits == null
                              ? null
                              : allocateOverhead(
                                  entry.budget,
                                  overhead.expectedUnits,
                                  data.finalUnits,
                                ),
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <p>
              Los gastos reales se comparan al cerrar el mes. No repitas IVA ni
              IIBB dentro de estos gastos.
            </p>
            <Link
              className="inline-block py-1 text-blue underline underline-offset-4"
              href={expensesUrl}
            >
              Administrar gastos del mes
            </Link>
          </div>
        </details>
      </section>
    </div>
  );
}
