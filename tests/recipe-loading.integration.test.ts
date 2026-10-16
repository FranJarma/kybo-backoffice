import { it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/pglite";
import { createDataModelTestContext } from "./helpers/data-model-database";
import * as schema from "@/db/schema";
import type { AppDb } from "@/db/client";
import { publishGroup } from "@/modules/modifiers/service";
import { createRecipeService } from "@/modules/recipes/service";
import { loadConfiguration } from "@/modules/recipes/configuration";

it("publishes and loads forty modifier options with a bounded number of queries", async () => {
  const ctx = await createDataModelTestContext();
  try {
    const actor = {
      id: randomUUID(),
      role: "admin" as const,
      branchId: ctx.mapping.initialBranch.id,
    };
    await ctx.db.insert(schema.user).values({
      id: actor.id,
      name: "Test",
      email: `${actor.id}@example.test`,
    });
    await ctx.db
      .insert(schema.operationalUsers)
      .values({ userId: actor.id, role: "admin" });
    const [product] = await ctx.db
      .insert(schema.products)
      .values({ name: "Test beverage" })
      .returning();
    const [item] = await ctx.db
      .insert(schema.items)
      .values({
        code: "TEST-LOAD-ITEM",
        name: "Test ingredient",
        class: "food",
        baseUnit: "g",
        unitCost: "2",
        recipeUsable: true,
        purchasable: true,
      })
      .returning();
    const group = await ctx.db.transaction((tx) =>
      publishGroup(tx, actor, {
        requestId: randomUUID(),
        name: "Instructions",
        options: Array.from({ length: 40 }, (_, i) => ({
          key: `option-${i}`,
          name: `Option ${i}`,
          kind: i < 2 ? ("composition" as const) : ("instruction" as const),
          components:
            i < 2
              ? [
                  {
                    itemId: item.id,
                    quantity: "10.000000",
                    wastePercent: "0.00",
                    baseUnit: "g" as const,
                  },
                ]
              : [],
        })),
      }),
    );
    const queries: string[] = [];
    const db = drizzle({
      client: ctx.client,
      schema,
      logger: {
        logQuery(query) {
          queries.push(query);
        },
      },
    }) as unknown as AppDb;
    const saved = await createRecipeService(db).save(actor, {
      requestId: randomUUID(),
      kind: "product",
      targetId: product.id,
      targetUnit: "unit",
      yieldQuantity: "1",
      compositionModel: "configurable",
      lines: [],
      groups: [
        {
          groupVersionId: group.versionId,
          name: "Instructions",
          min: 1,
          max: 1,
          factor: "1",
          options: Array.from({ length: 40 }, (_, i) => ({
            optionKey: `option-${i}`,
            enabled: true,
            defaultCount: i === 0 ? 1 : 0,
            maxCount: 1,
            mode: i === 1 ? "override" : "inherit",
            components:
              i === 1
                ? [
                    {
                      itemId: item.id,
                      quantity: "20",
                      wastePercent: "0",
                      baseUnit: "g",
                    },
                  ]
                : [],
            prices: {},
          })),
        },
      ],
    });
    const optionInserts = queries.filter((q) =>
      q.startsWith('insert into "recipe_modifier_options"'),
    );
    const priceInserts = queries.filter((q) =>
      q.startsWith('insert into "recipe_modifier_option_prices"'),
    );
    // Baseline: 230 round trips for this same publication.
    expect(queries.length).toBeLessThanOrEqual(75);
    expect(optionInserts).toHaveLength(1);
    expect(priceInserts).toHaveLength(1);
    queries.length = 0;
    const config = await loadConfiguration(db, saved.versionId);
    expect(config.groups[0].options).toHaveLength(40);
    expect(config.groups[0].options[0]).toMatchObject({
      name: "Option 0",
      defaultCount: 1,
      prices: { counter: "0.00" },
      components: [
        expect.objectContaining({
          itemId: item.id,
          quantity: "10.000000",
          archived: false,
        }),
      ],
    });
    expect(config.groups[0].options[1].components).toEqual([
      expect.objectContaining({
        itemId: item.id,
        quantity: "20.000000",
        archived: false,
      }),
    ]);
    expect(config.groups[0].options[2].components).toEqual([]);
    expect(queries.length).toBeLessThanOrEqual(14);
    queries.length = 0;
    expect(await loadConfiguration(db, saved.versionId, saved)).toEqual(config);
    expect(queries.length).toBeLessThanOrEqual(7);
  } finally {
    await ctx.close();
  }
});
