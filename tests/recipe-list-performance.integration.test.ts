import { afterAll, beforeAll, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";
import * as s from "@/db/schema";
import { createRecipeService } from "@/modules/recipes/service";
import { createDataModelTestContext } from "./helpers/data-model-database";

let ctx: Awaited<ReturnType<typeof createDataModelTestContext>>;
const actor: Actor = { id: "recipe-list-performance", role: "admin" };
let otherBranch: string;
let raw: typeof s.items.$inferSelect;
let prepared: typeof s.items.$inferSelect;
let unknown: typeof s.items.$inferSelect;
let archived: typeof s.items.$inferSelect;
let modifierGroup: typeof s.modifierGroups.$inferSelect;
let modifierVersion: typeof s.modifierGroupVersions.$inferSelect;
let modifierOptions: (typeof s.modifierOptions.$inferSelect)[];
const batch: { id: string; targetId: string; name: string }[] = [];

type Ingredient = {
  item: typeof s.items.$inferSelect;
  quantity: string;
  wastePercent?: string;
};

async function definition(
  name: string,
  compositionModel: "legacy" | "configurable",
  lines: { optional?: boolean; options: Ingredient[] }[],
  output?: typeof s.items.$inferSelect,
  yieldQuantity = "1",
) {
  const target =
    output ??
    (
      await ctx.db
        .insert(s.products)
        .values({ name, vatRate: "21" })
        .returning()
    )[0];
  const [recipe] = await ctx.db
    .insert(s.recipes)
    .values({
      kind: output ? "preparation" : "product",
      productId: output ? null : target.id,
      outputItemId: output?.id,
    })
    .returning();
  const [version] = await ctx.db
    .insert(s.recipeVersions)
    .values({
      recipeId: recipe.id,
      version: 1,
      compositionModel,
      outputName: name,
      outputUnit: output?.baseUnit ?? "unit",
      yieldQuantity,
      actorId: actor.id,
    })
    .returning();
  for (const [position, input] of lines.entries()) {
    const [line] = await ctx.db
      .insert(s.recipeLines)
      .values({
        versionId: version.id,
        position,
        optional: input.optional,
      })
      .returning();
    await ctx.db.insert(s.recipeOptions).values(
      input.options.map((o, position) => ({
        lineId: line.id,
        position,
        itemId: o.item.id,
        itemName: o.item.name,
        baseUnit: o.item.baseUnit,
        quantity: o.quantity,
        wastePercent: o.wastePercent ?? "0",
      })),
    );
  }
  if (!output)
    await ctx.db.insert(s.productPrices).values({
      productId: target.id,
      channel: "counter",
      amount: "250",
    });
  return { id: recipe.id, targetId: target.id, name, versionId: version.id };
}

async function bindings(versionId: string, defaults = [2, 1, 1, 0, 0, 0]) {
  const count = defaults.reduce((sum, n) => sum + n, 0);
  const [group] = await ctx.db
    .insert(s.recipeModifierGroups)
    .values({
      recipeVersionId: versionId,
      groupId: modifierGroup.id,
      groupVersionId: modifierVersion.id,
      name: "Extras",
      position: 0,
      min: count,
      max: count,
      factor: "2",
    })
    .returning();
  const options = await ctx.db
    .insert(s.recipeModifierOptions)
    .values(
      modifierOptions.map((option, i) => ({
        recipeVersionId: versionId,
        recipeModifierGroupId: group.id,
        groupVersionId: modifierVersion.id,
        optionId: option.id,
        enabled: true,
        defaultCount: defaults[i],
        maxCount: i === 0 ? 2 : 1,
        mode: i === 1 ? "override" : "inherit",
      })),
    )
    .returning();
  await ctx.db.insert(s.recipeModifierOptionComponents).values({
    recipeModifierOptionId: options[1].id,
    itemId: prepared.id,
    name: prepared.name,
    baseUnit: "ml",
    quantity: "3",
    wastePercent: "25",
  });
  await ctx.db.insert(s.recipeModifierOptionPrices).values(
    options.map((o) => ({
      recipeModifierOptionId: o.id,
      channel: "counter",
      surcharge: "17",
    })),
  );
}

beforeAll(async () => {
  ctx = await createDataModelTestContext();
  actor.branchId = ctx.mapping.initialBranch.id;
  await ctx.db.insert(s.user).values({
    id: actor.id,
    name: "Test",
    email: "recipe-list-performance@example.test",
  });
  await ctx.db
    .insert(s.operationalUsers)
    .values({ userId: actor.id, role: "admin" });
  [raw, prepared, unknown, archived] = await ctx.db
    .insert(s.items)
    .values([
      {
        code: "LIST-RAW",
        name: "Raw",
        class: "food",
        baseUnit: "g",
        unitCost: "7",
        recipeUsable: true,
        purchasable: true,
      },
      {
        code: "LIST-PREP",
        name: "Prepared",
        class: "food",
        baseUnit: "ml",
        recipeUsable: true,
        purchasable: false,
      },
      {
        code: "LIST-UNKNOWN",
        name: "Unknown",
        class: "food",
        baseUnit: "g",
        recipeUsable: true,
        purchasable: true,
      },
      {
        code: "LIST-ARCHIVED",
        name: "Archived",
        class: "food",
        baseUnit: "g",
        unitCost: "3",
        recipeUsable: true,
        purchasable: true,
      },
    ])
    .returning();
  const [branch] = await ctx.db
    .insert(s.branches)
    .values({
      code: "LIST-B",
      name: "Branch B",
      timeZone: "UTC",
    })
    .returning();
  otherBranch = branch.id;
  await ctx.db.insert(s.inventoryValuations).values([
    {
      branchId: actor.branchId!,
      itemId: raw.id,
      quantity: "100",
      value: "200",
    },
    { branchId: otherBranch, itemId: raw.id, quantity: "100", value: "500" },
  ]);
  await definition(
    "Shape preparation",
    "legacy",
    [{ options: [{ item: raw, quantity: "20", wastePercent: "20" }] }],
    prepared,
    "100",
  );
  [modifierGroup] = await ctx.db
    .insert(s.modifierGroups)
    .values({ name: "Extras" })
    .returning();
  [modifierVersion] = await ctx.db
    .insert(s.modifierGroupVersions)
    .values({
      groupId: modifierGroup.id,
      version: 1,
      name: "Extras",
      actorId: actor.id,
    })
    .returning();
  modifierOptions = await ctx.db
    .insert(s.modifierOptions)
    .values(
      [
        "Inherited",
        "Override",
        "Instruction",
        "Unselected",
        "Archived",
        "Wrong unit",
      ].map((name, position) => ({
        groupVersionId: modifierVersion.id,
        key: `option-${position}`,
        name,
        kind: position === 2 ? "instruction" : "composition",
        position,
        instruction: position === 2 ? "Serve cold" : null,
      })),
    )
    .returning();
  await ctx.db.insert(s.modifierOptionComponents).values([
    {
      optionId: modifierOptions[0].id,
      itemId: raw.id,
      name: raw.name,
      baseUnit: "g",
      quantity: "1",
      wastePercent: "50",
    },
    {
      optionId: modifierOptions[1].id,
      itemId: unknown.id,
      name: unknown.name,
      baseUnit: "g",
      quantity: "99",
    },
    {
      optionId: modifierOptions[3].id,
      itemId: unknown.id,
      name: unknown.name,
      baseUnit: "g",
      quantity: "1",
    },
    {
      optionId: modifierOptions[4].id,
      itemId: archived.id,
      name: archived.name,
      baseUnit: "g",
      quantity: "1",
    },
    {
      optionId: modifierOptions[5].id,
      itemId: raw.id,
      name: raw.name,
      baseUnit: "ml",
      quantity: "1",
    },
  ]);
  for (let i = 0; i < 40; i++) {
    const row = await definition(
      `Batch ${String(i).padStart(2, "0")}`,
      "configurable",
      [
        { options: [{ item: raw, quantity: "10", wastePercent: "20" }] },
        { options: [{ item: prepared, quantity: "4" }] },
      ],
    );
    await bindings(row.versionId);
    batch.push(row);
  }
  await definition(
    "Shape legacy",
    "legacy",
    [
      { options: [{ item: raw, quantity: "10", wastePercent: "20" }] },
      { optional: true, options: [{ item: raw, quantity: "2" }] },
      {
        options: [
          { item: prepared, quantity: "4" },
          { item: unknown, quantity: "99" },
        ],
      },
    ],
    undefined,
    "2",
  );
  await definition("Shape unknown", "configurable", [
    { options: [{ item: unknown, quantity: "1" }] },
  ]);
  for (const [name, defaults] of [
    ["Shape archived modifier", [0, 0, 0, 0, 1, 0]],
    ["Shape wrong unit", [0, 0, 0, 0, 0, 1]],
  ] as const) {
    const row = await definition(name, "configurable", []);
    await bindings(row.versionId, [...defaults]);
  }
  await ctx.db
    .update(s.items)
    .set({ archivedAt: new Date("2026-11-01") })
    .where(eq(s.items.id, archived.id));
}, 60000);

afterAll(async () => {
  await ctx?.close();
});

it("bounds recipe-list reads independently of the number of configurable recipes", async () => {
  const queries: string[] = [];
  const db = drizzle({
    client: ctx.client,
    schema: s,
    logger: {
      logQuery(query) {
        queries.push(query);
      },
    },
  }) as unknown as AppDb;
  const service = createRecipeService(db);
  const counts: number[] = [];
  for (const [search, size] of [
    ["Batch 00", 1],
    ["Batch 0", 10],
    ["Batch ", 40],
  ] as const) {
    queries.length = 0;
    const result = await service.list(actor, "product", search);
    counts.push(queries.filter((q) => /^select\b/i.test(q)).length);
    // 12.5 g fixed + 8 g inherited; 4 ml fixed + 4 ml override.
    // Raw costs 2/g, preparation costs (25 g * 2)/100 = 0.5/ml.
    expect(result).toEqual({
      total: size,
      rows: batch.slice(0, size).map((row) => ({
        id: row.id,
        targetId: row.targetId,
        name: row.name,
        kind: "product",
        baseUnit: "unit",
        yieldQuantity: "1.000000",
        revision: 1,
        archived: false,
        priceCounter: "250.00",
        unitCost: "45.000000",
      })),
    });
  }
  console.info(
    "RECIPE_LIST_SELECTS",
    JSON.stringify({ rows: [1, 10, 40], selects: counts }),
  );
  expect(counts[0]).toBeLessThanOrEqual(17);
  expect(counts[1]).toBe(counts[0]);
  expect(counts[2]).toBe(counts[0]);
});

it("does not calculate unseen costs for an empty search or an out-of-range page", async () => {
  const queries: string[] = [];
  const db = drizzle({
    client: ctx.client,
    schema: s,
    logger: { logQuery: (query) => queries.push(query) },
  }) as unknown as AppDb;
  const service = createRecipeService(db);
  for (const [search, offset, total] of [
    ["No matching recipe", 0, 0],
    ["Batch ", 100, 40],
  ] as const) {
    queries.length = 0;
    expect(await service.list(actor, "product", search, offset)).toEqual({
      rows: [],
      total,
    });
    const selects = queries.filter((query) => /^select\b/i.test(query)).length;
    console.info(
      "EMPTY_RECIPE_LIST_SELECTS",
      JSON.stringify({ offset, selects }),
    );
    expect(selects).toBeLessThanOrEqual(8);
  }
});

it("preserves legacy default alternatives, optional lines, yields and unavailable costs", async () => {
  const result = await createRecipeService(ctx.db).list(
    actor,
    undefined,
    "Shape ",
  );
  expect(result.total).toBe(5);
  expect(
    result.rows.map((row) => [row.name, row.unitCost, row.priceCounter]),
  ).toEqual([
    ["Shape archived modifier", null, "250.00"],
    ["Shape legacy", "15.500000", "250.00"],
    ["Shape preparation", "0.500000", null],
    ["Shape unknown", null, "250.00"],
    ["Shape wrong unit", null, "250.00"],
  ]);
});

it("keeps shared and branch valuation scopes separate and refreshes costs between requests", async () => {
  const service = createRecipeService(ctx.db);
  const cost = async (who: Actor) =>
    (await service.list(who, "product", "Batch 00")).rows[0].unitCost;
  expect(await cost(actor)).toBe("45.000000");
  expect(await cost({ ...actor, branchId: otherBranch })).toBe("112.500000");
  expect(await cost({ ...actor, branchId: undefined })).toBe("157.500000");
  const where = and(
    eq(s.inventoryValuations.branchId, actor.branchId!),
    eq(s.inventoryValuations.itemId, raw.id),
  );
  try {
    await ctx.db
      .update(s.inventoryValuations)
      .set({ value: "300" })
      .where(where);
    expect(await cost(actor)).toBe("67.500000");
    await ctx.db
      .update(s.inventoryValuations)
      .set({ value: null })
      .where(where);
    expect(await cost(actor)).toBeNull();
    expect(await cost({ ...actor, branchId: otherBranch })).toBe("112.500000");
    expect(await cost({ ...actor, branchId: undefined })).toBe("157.500000");
  } finally {
    await ctx.db
      .update(s.inventoryValuations)
      .set({ value: "200" })
      .where(where);
  }
});

it("requires branch access before returning costs to a catalog manager", async () => {
  const manager: Actor = {
    id: "recipe-list-catalog-manager",
    role: "manager",
    branchId: otherBranch,
  };
  await ctx.db.insert(s.user).values({
    id: manager.id,
    name: "Catalog",
    email: "recipe-list-manager@example.test",
  });
  await ctx.db
    .insert(s.operationalUsers)
    .values({ userId: manager.id, role: "manager", catalogManager: true });
  await expect(
    createRecipeService(ctx.db).list(manager, "product", "No matching recipe"),
  ).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
  await expect(createRecipeService(ctx.db).list(manager)).rejects.toMatchObject(
    { code: "FORBIDDEN", status: 403 },
  );
});
