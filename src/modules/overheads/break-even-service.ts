import { and, asc, eq, gte, inArray, isNull, lt, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { products } from "@/db/business-schema";
import { branchProducts, branches } from "@/db/branch-schema";
import { expensePeriods } from "@/db/overhead-schema";
import { sales, saleOrders, saleLines } from "@/db/sales-schema";
import { catalogProductCosts } from "@/modules/catalog/product-costs";
import { estimateProfitability } from "@/modules/pricing/product-profitability";
import { getExpenses } from "./service";
import type { BreakEvenSnapshot } from "./break-even-model";

export async function getBreakEven(
  db: AppDb,
  actor: Actor,
  rawMonth?: string,
): Promise<BreakEvenSnapshot> {
  // The existing financial read checks effective branch permissions before costs.
  const expense = await getExpenses(db, actor, rawMonth);
  const branchId = expense.branchId;
  const [year, month] = expense.month.split("-").map(Number);
  const start = `${expense.month}-01`;
  const end = `${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, "0")}-01`;
  const parents = alias(saleLines, "break_even_parent");
  const owner = sql<string>`coalesce(${parents.productId},${saleLines.productId})`;
  const closed = and(
    eq(sales.branchId, branchId),
    eq(sales.status, "closed"),
    gte(sales.businessDate, start),
    lt(sales.businessDate, end),
  );
  const [catalog, observed, finalUnitsByProduct, branchRows] =
    await Promise.all([
      db
        .select({ id: products.id, name: products.name, kind: products.kind })
        .from(products)
        .innerJoin(
          branchProducts,
          and(
            eq(branchProducts.productId, products.id),
            eq(branchProducts.branchId, branchId),
            eq(branchProducts.enabled, true),
          ),
        )
        .where(isNull(products.archivedAt))
        .orderBy(asc(products.sortOrder), asc(products.name), asc(products.id)),
      db
        .select({
          productId: saleLines.productId,
          quantity: sql<string>`sum(${saleLines.quantity})::text`,
        })
        .from(sales)
        .innerJoin(saleOrders, eq(saleOrders.saleId, sales.id))
        .innerJoin(saleLines, eq(saleLines.orderId, saleOrders.id))
        .where(
          and(closed, inArray(saleLines.lineKind, ["individual", "combo"])),
        )
        .groupBy(saleLines.productId),
      db
        .select({
          productId: owner,
          quantity: sql<string>`sum(${saleLines.quantity})::text`,
        })
        .from(sales)
        .innerJoin(saleOrders, eq(saleOrders.saleId, sales.id))
        .innerJoin(saleLines, eq(saleLines.orderId, saleOrders.id))
        .leftJoin(parents, eq(parents.id, saleLines.parentLineId))
        .where(and(closed, ne(saleLines.lineKind, "combo")))
        .groupBy(owner),
      db
        .select({ name: branches.name })
        .from(branches)
        .where(eq(branches.id, branchId)),
    ]);
  const batches = Array.from(
    { length: Math.ceil(catalog.length / 10) },
    (_, i) => catalog.slice(i * 10, (i + 1) * 10),
  );
  const reports: Awaited<ReturnType<typeof catalogProductCosts>>[] = [];
  // Bounded parallel work; the public costing contract permits ten detailed products.
  for (let i = 0; i < batches.length; i += 2) {
    reports.push(
      ...(await Promise.all(
        batches.slice(i, i + 2).map((batch) =>
          catalogProductCosts(db, actor, {
            ids: batch.map((product) => product.id),
            profitability: true,
            month: expense.month,
          }),
        ),
      )),
    );
  }
  const costs = new Map(
    reports.flatMap((report) =>
      report.products.map((product) => [product.productId, product] as const),
    ),
  );
  const profitability = new Map(
    reports.flatMap((report) =>
      (report.profitability ?? []).map(
        (product) => [product.productId, product] as const,
      ),
    ),
  );
  const quoted: BreakEvenSnapshot["products"] = catalog.map((product) => {
    const data = profitability.get(product.id);
    const detail = costs.get(product.id);
    const estimates = data
      ? data.channels
          .filter((channel) => channel.enabled)
          .map((channel) => {
            const value = estimateProfitability(data, channel.id, {});
            return {
              channel: channel.id,
              price: value.finalPrice,
              netPrice: value.netPrice,
              cost: value.cost,
              vat: value.vatAmount,
              iibb: value.iibbAmount,
              methods: value.methods.map((method) => ({
                id: method.id,
                commission: method.commission,
                contribution: method.marginAfterTaxes,
              })),
            };
          })
      : [];
    const missingCost =
      !data ||
      detail?.status === "unconfigured" ||
      (estimates.length > 0 &&
        estimates.every((estimate) => estimate.cost === null));
    const pendingReasons = missingCost
      ? [...(detail?.pendingReasons ?? [])]
      : [];
    if (missingCost)
      pendingReasons.push(
        "Falta publicar la receta, vincular la venta directa o completar el costo de sus componentes.",
      );
    if (data?.vatRate == null)
      pendingReasons.push("Falta configurar el IVA del producto.");
    return {
      id: product.id,
      name: product.name,
      kind: product.kind === "combo" ? "combo" : "individual",
      finalUnits: data?.finalUnits ?? null,
      labels: data ? estimateProfitability(data, "counter", {}).labels : [],
      pendingReasons: [...new Set(pendingReasons)],
      estimates,
    };
  });
  const ids = new Set(catalog.map((product) => product.id));
  const historicalExcludedUnits = finalUnitsByProduct
    .filter((row) => !ids.has(row.productId))
    .reduce((sum, row) => sum + Number(row.quantity), 0);
  const warnings: string[] = [];
  if ([...costs.values()].some((product) => product.referenceItems.length > 0))
    warnings.push(
      "Algunos costos usan referencias de las fichas o estimaciones de preparación por falta de stock valorado.",
    );
  if (historicalExcludedUnits)
    warnings.push(
      "Hay unidades vendidas de productos que ya no están habilitados en esta sucursal. La mezcla disponible es parcial.",
    );
  warnings.push(
    "Usa precios, costos y composiciones predeterminadas actuales. Las opciones del cliente, descuentos y cambios de costos pueden modificar el resultado.",
  );
  const [latest] = await db
    .select({ revision: expensePeriods.revision })
    .from(expensePeriods)
    .where(
      and(
        eq(expensePeriods.branchId, branchId),
        eq(expensePeriods.month, start),
      ),
    );
  if ((latest?.revision ?? null) !== (expense.period?.revision ?? null))
    throw new AppError(
      "EXPENSE_CONFLICT",
      "El presupuesto cambió durante la consulta. Actualizá el análisis.",
      409,
    );
  return {
    branchId,
    branchName: branchRows[0].name,
    month: expense.month,
    asOf: new Date().toISOString(),
    expenseRevision: expense.period?.revision ?? null,
    budget: {
      total:
        expense.period?.entries.length && !expense.summary.budgetPending
          ? expense.summary.budgetTotal
          : null,
      expectedUnits: expense.period?.expectedUnits ?? null,
      rate: expense.summary.budgetRate,
      pending: expense.summary.budgetPending,
      entries: expense.period?.entries ?? [],
    },
    methods: reports[0]?.profitability?.[0]?.methods ?? [],
    historicalMix: observed
      .filter((row) => ids.has(row.productId))
      .map((row) => ({
        productId: row.productId,
        quantity: Number(row.quantity),
      })),
    historicalUnits: expense.actualUnits,
    historicalExcludedUnits,
    warnings,
    products: quoted,
  };
}
