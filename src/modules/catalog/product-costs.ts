import { loadCombo } from "../combos/service";
import { budgetBasis, expenseMonth } from "../overheads/service";
import { businessDate } from "../operations/business-date";
import { comboCostRange } from "../combos/costs";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";
import { products, productPrices, paymentMethods } from "@/db/business-schema";
import { AppError } from "@/lib/errors";
import {
  profitabilityChannels,
  referenceBasis,
  type ProfitabilityBasis,
  type ProfitabilityData,
} from "@/modules/pricing/product-profitability";
import {
  productFulfillments,
  productFulfillmentVersions,
} from "@/db/product-fulfillment-schema";
import { recipes, recipeVersions } from "@/db/recipe-schema";
import { branches, branchProducts } from "@/db/branch-schema";
import {
  requireCatalogRead,
  requireOperationalContext,
} from "@/modules/branches/context";
import { costContext } from "@/modules/recipes/service";
import { costConfigurations } from "./cost-configurations";
import { consumptionQuantity } from "@/modules/recipes/waste";
import {
  integer,
  SCALE,
  roundedDivision,
  six,
  safeScaled,
  cents,
} from "@/modules/inventory/decimal";
import type { Component, Configuration } from "@/modules/modifiers/types";
import {
  groupCostRange,
  selectedCost,
  sumCosts,
  type ProductCost,
  type CostGroup,
} from "./product-cost-model";

export async function catalogProductCosts(
  db: AppDb,
  actor: Actor,
  raw: unknown,
) {
  const input = z
    .object({
      ids: z.array(z.uuid()).min(1).max(50),
      detail: z.boolean().optional(),
      profitability: z.boolean().optional(),
      month: expenseMonth.optional(),
    })
    .strict()
    .refine(
      (input) =>
        input.ids.length <= 10 || (!input.detail && !input.profitability),
      {
        message:
          "Consultá hasta diez productos para el detalle o la rentabilidad.",
        path: ["ids"],
      },
    )
    .parse(raw);
  await requireCatalogRead(db, actor);
  const ctx = await requireOperationalContext(db, actor, actor.branchId ?? "");
  if (input.profitability && ctx.role === "staff")
    throw new AppError(
      "FORBIDDEN",
      "Se requiere permiso de encargado para consultar la rentabilidad.",
      403,
    );
  return db.transaction(
    async (tx) => {
      const [branch] = await tx
        .select({ name: branches.name })
        .from(branches)
        .where(eq(branches.id, ctx.branchId));
      const comboIds = await tx
        .select({ id: products.id })
        .from(products)
        .where(
          and(inArray(products.id, input.ids), eq(products.kind, "combo")),
        );
      const definitions = await Promise.all(
        comboIds.map(({ id }) => loadCombo(tx, id)),
      );
      const allIds = [
        ...new Set([
          ...input.ids,
          ...definitions.flatMap(
            (d) =>
              d?.groups.flatMap((g) => g.options.map((o) => o.productId)) ?? [],
          ),
        ]),
      ];
      const rows = await tx
        .select({
          id: products.id,
          kind: products.kind,
          fulfillment: productFulfillmentVersions,
          recipeId: recipes.id,
          version: {
            id: recipeVersions.id,
            version: recipeVersions.version,
            compositionModel: recipeVersions.compositionModel,
            yieldQuantity: recipeVersions.yieldQuantity,
          },
        })
        .from(products)
        .leftJoin(
          productFulfillments,
          eq(productFulfillments.productId, products.id),
        )
        .leftJoin(
          productFulfillmentVersions,
          eq(productFulfillmentVersions.id, productFulfillments.versionId),
        )
        .leftJoin(recipes, eq(recipes.productId, products.id))
        .leftJoin(
          recipeVersions,
          and(
            eq(recipeVersions.recipeId, recipes.id),
            eq(recipeVersions.version, recipes.revision),
          ),
        )
        .where(inArray(products.id, allIds));
      // Empty/unconfigured batches do not need inventory or preparation graphs.
      const estimate = rows.some(
        (row) =>
          row.fulfillment?.mode === "direct" || (row.recipeId && row.version),
      )
        ? await costContext(tx, ctx.branchId)
        : undefined;
      const configurations = await costConfigurations(
        tx,
        rows.flatMap((row) =>
          row.version && row.fulfillment?.mode !== "direct"
            ? [row.version]
            : [],
        ),
        !!input.profitability,
      );
      const results: ProductCost[] = [];
      const bases = new Map<string, ProfitabilityBasis>();
      for (const row of rows) {
        let profitConfig: Configuration | undefined;
        const refs = new Set<string>();
        const cost = (
          components: Component[],
          factor = SCALE,
          divisor = SCALE,
        ): string | null => {
          const amounts = new Map<string, bigint>();
          for (const c of components) {
            if (c.archived) return null;
            const q = integer(
              consumptionQuantity(c.quantity, c.wastePercent, factor, divisor),
            );
            amounts.set(c.itemId, (amounts.get(c.itemId) ?? 0n) + q);
          }
          return sumCosts(
            [...amounts].map(([id, q]) => {
              const value = estimate!(id);
              value.referenceItems.forEach((n) => refs.add(n));
              return value.value === null
                ? null
                : six(safeScaled(roundedDivision(value.value * q, SCALE), 24));
            }),
          );
        };
        let model: ProductCost = {
          productId: row.id,
          status: "unconfigured",
          pendingReasons:
            row.kind === "combo"
              ? ["Publicá los componentes del combo para calcular su costo."]
              : [],
          fixed: null,
          min: null,
          max: null,
          defaultCost: null,
          referenceItems: [],
          groups: [],
        };
        if (row.fulfillment?.mode === "direct") {
          const value = estimate!(row.fulfillment.itemId!);
          value.referenceItems.forEach((n) => refs.add(n));
          const amount =
            value.value === null
              ? null
              : six(
                  safeScaled(
                    roundedDivision(
                      value.value * integer(row.fulfillment.quantity!),
                      SCALE,
                    ),
                    24,
                  ),
                );
          model = {
            ...model,
            status: amount === null ? "pending" : "ready",
            fixed: amount,
            min: amount,
            max: amount,
            defaultCost: amount,
          };
        } else if (row.version) {
          const config = configurations.get(row.version.id)!;
          const fixed = cost(
            config.fixed,
            SCALE,
            integer(config.yieldQuantity),
          );
          const groups: CostGroup[] = config.groups.map((g) => ({
            id: g.id,
            name: g.name,
            min: g.min,
            max: g.max,
            options: g.options
              .filter((o) => o.enabled)
              .map((o) => ({
                id: o.id,
                name: o.name,
                defaultCount: o.defaultCount,
                costs: Array.from(
                  { length: Math.min(o.maxCount, g.max) + 1 },
                  (_, n) =>
                    n === 0
                      ? "0.000000"
                      : o.kind === "instruction"
                        ? "0.000000"
                        : !o.components.length
                          ? null
                          : cost(
                              o.components,
                              (o.mode === "inherit"
                                ? integer(g.factor)
                                : SCALE) * BigInt(n),
                            ),
                ),
              })),
          }));
          const ranges = groups.map(groupCostRange);
          const min = sumCosts([fixed, ...ranges.map((r) => r.min)]);
          const max = sumCosts([fixed, ...ranges.map((r) => r.max)]);
          const defaults = selectedCost({ fixed, groups }, {});
          profitConfig = config;
          model = {
            ...model,
            fixed,
            groups,
            min,
            max,
            defaultCost: defaults.cost,
            status: min === null || max === null ? "pending" : "ready",
          };
        }
        results.push({
          ...model,
          referenceItems: [...refs],
          groups: input.detail ? model.groups : [],
        });
        if (input.profitability)
          bases.set(row.id, referenceBasis(model.defaultCost, profitConfig));
      }
      const available = definitions.length
        ? new Set(
            (
              await tx
                .select({ id: branchProducts.productId })
                .from(branchProducts)
                .where(
                  and(
                    eq(branchProducts.branchId, ctx.branchId),
                    eq(branchProducts.enabled, true),
                    eq(branchProducts.temporarilySoldOut, false),
                    inArray(branchProducts.productId, allIds),
                  ),
                )
            ).map((p) => p.id),
          )
        : undefined;
      const byId = new Map(results.map((r) => [r.productId, r]));
      for (const definition of definitions)
        if (definition)
          byId.set(
            definition.productId,
            comboCostRange(definition, byId, available),
          );
      let profitability: ProfitabilityData[] | undefined;
      if (input.profitability) {
        const overhead = await budgetBasis(
          tx,
          ctx.branchId,
          input.month ?? businessDate(new Date(), ctx.timeZone).slice(0, 7),
        );
        const [commercial, prices, methods] = await Promise.all([
          tx.select().from(products).where(inArray(products.id, input.ids)),
          tx
            .select()
            .from(productPrices)
            .where(inArray(productPrices.productId, input.ids)),
          tx
            .select({
              id: paymentMethods.id,
              name: paymentMethods.name,
              percent: paymentMethods.commissionPercent,
            })
            .from(paymentMethods)
            .where(isNull(paymentMethods.archivedAt))
            .orderBy(asc(paymentMethods.name)),
        ]);
        profitability = commercial.map((product) => {
          const definition = definitions.find(
            (d) => d?.productId === product.id,
          );
          return {
            productId: product.id,
            overhead,
            finalUnits:
              product.kind === "combo"
                ? definition
                  ? definition.groups.reduce((sum, g) => sum + g.quantity, 0)
                  : null
                : 1,
            vatRate: product.vatRate,
            channels: profitabilityChannels.map((channel) => ({
              id: channel,
              enabled:
                channel === "counter"
                  ? product.enabledCounter
                  : channel === "pedidosya"
                    ? product.enabledPedidosYa
                    : product.enabledUberEats,
              finalBase:
                prices.find(
                  (p) => p.productId === product.id && p.channel === channel,
                )?.amount ?? null,
            })),
            basis: definition
              ? referenceBasis("0.000000")
              : bases.get(product.id)!,
            groups:
              definition?.groups.map((group) => ({
                id: group.id,
                name: group.name,
                quantity: group.quantity,
                options: group.options
                  .filter((o) => !o.archived && available?.has(o.productId))
                  .map((option) => {
                    const basis =
                      bases.get(option.productId) ?? referenceBasis(null);
                    return {
                      id: option.id,
                      name: option.name,
                      basis: {
                        ...basis,
                        extras: Object.fromEntries(
                          profitabilityChannels.map((channel) => [
                            channel,
                            basis.extras[channel] == null
                              ? null
                              : cents(
                                  integer(basis.extras[channel]!) +
                                    integer(option[channel]),
                                ),
                          ]),
                        ),
                      },
                    };
                  }),
              })) ?? [],
            methods,
          };
        });
      }
      return {
        branchId: ctx.branchId,
        branchName: branch.name,
        products: input.ids.flatMap((id) =>
          byId.has(id) ? [byId.get(id)!] : [],
        ),
        ...(profitability ? { profitability } : {}),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
