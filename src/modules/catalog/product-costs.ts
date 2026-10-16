import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";
import { products } from "@/db/business-schema";
import {
  productFulfillments,
  productFulfillmentVersions,
} from "@/db/product-fulfillment-schema";
import { recipes, recipeVersions } from "@/db/recipe-schema";
import { branches } from "@/db/branch-schema";
import {
  requireCatalogRead,
  requireOperationalContext,
} from "@/modules/branches/context";
import { costContext, recipeDefinition } from "@/modules/recipes/service";
import { loadConfiguration } from "@/modules/recipes/configuration";
import { consumptionQuantity } from "@/modules/recipes/waste";
import {
  integer,
  SCALE,
  roundedDivision,
  six,
  safeScaled,
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
      ids: z.array(z.uuid()).min(1).max(10),
      detail: z.boolean().optional(),
    })
    .strict()
    .parse(raw);
  await requireCatalogRead(db, actor);
  const ctx = await requireOperationalContext(db, actor, actor.branchId ?? "");
  return db.transaction(
    async (tx) => {
      const [branch] = await tx
        .select({ name: branches.name })
        .from(branches)
        .where(eq(branches.id, ctx.branchId));
      const rows = await tx
        .select({
          id: products.id,
          fulfillment: productFulfillmentVersions,
          recipeId: recipes.id,
          versionId: recipeVersions.id,
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
        .where(inArray(products.id, input.ids));
      // Empty/unconfigured batches do not need inventory or preparation graphs.
      const estimate = rows.some(
        (row) =>
          row.fulfillment?.mode === "direct" || (row.recipeId && row.versionId),
      )
        ? await costContext(tx, ctx.branchId)
        : undefined;
      const results: ProductCost[] = [];
      for (const row of rows) {
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
        } else if (row.recipeId && row.versionId) {
          const def = await recipeDefinition(tx, row.recipeId, row.versionId);
          let config: Configuration;
          if (def.compositionModel === "configurable")
            config = await loadConfiguration(tx, row.versionId, def);
          else
            config = {
              recipeVersionId: def.versionId,
              revision: def.revision,
              model: "legacy",
              yieldQuantity: def.yieldQuantity,
              fixed: def.lines
                .filter((l) => !l.optional && l.options.length === 1)
                .map((l) => l.options[0]),
              groups: def.lines
                .filter((l) => l.optional || l.options.length > 1)
                .map((l, i) => ({
                  id: l.id,
                  name: "Alternativas " + (i + 1),
                  groupVersionId: l.id,
                  min: l.optional ? 0 : 1,
                  max: 1,
                  factor: "1.000000",
                  options: l.options.map((o, j) => ({
                    ...o,
                    key: o.id,
                    kind: "composition",
                    instruction: null,
                    enabled: true,
                    defaultCount: j === 0 ? 1 : 0,
                    maxCount: 1,
                    mode: "override",
                    components: [
                      {
                        ...o,
                        quantity: consumptionQuantity(
                          o.quantity,
                          o.wastePercent,
                          SCALE,
                          integer(def.yieldQuantity),
                        ),
                        wastePercent: "0.00",
                      },
                    ],
                    prices: {},
                  })),
                })),
            };
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
      }
      return {
        branchId: ctx.branchId,
        branchName: branch.name,
        products: results,
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
