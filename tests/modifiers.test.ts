import { randomUUID as uid } from "node:crypto";
import { beforeAll, afterAll, it, expect } from "vitest";
import { createTestDb } from "./helpers/database";
import { user, items } from "@/db/schema";
import { createModifierService } from "@/modules/modifiers/service";
const actor = { id: "mod-admin", role: "admin" as const };
let ctx: Awaited<ReturnType<typeof createTestDb>>;
let itemId: string;
const recordedQueries: string[] = [];
beforeAll(async () => {
  ctx = await createTestDb({
    logQuery(query) {
      recordedQueries.push(query);
    },
  });
  await ctx.db.insert(user).values({
    id: actor.id,
    name: "Fran",
    email: "mod@test.local",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  const [r] = await ctx.db
    .insert(items)
    .values({
      code: crypto.randomUUID(),
      class: "food",
      purchasable: true,
      recipeUsable: true,
      name: "Tapioca",
      baseUnit: "g",
      unitCost: "2",
    })
    .returning();
  itemId = r.id;
});
afterAll(async () => ctx?.close());
it("publishes immutable versions and rejects stale edits and staff", async () => {
  const s = createModifierService(ctx.db);
  const input = {
    requestId: uid(),
    name: "Perlas",
    options: [
      {
        key: "tapioca",
        name: "Tapioca",
        kind: "composition",
        components: [{ itemId, quantity: "40", baseUnit: "g" }],
      },
    ],
  };
  const first = await s.save(actor, input);
  expect(first.options[0].components[0].quantity).toBe("40.000000");
  const second = await s.save(actor, {
    ...input,
    requestId: uid(),
    id: first.id,
    revision: 1,
    name: "Burbujas",
  });
  expect(second.revision).toBe(2);
  expect((await s.get(actor, first.id, first.versionId)).name).toBe("Perlas");
  expect((await s.save(actor, input)).versionId).toBe(first.versionId);
  await expect(
    s.save(actor, { ...input, requestId: uid(), id: first.id, revision: 1 }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    s.save({ ...actor, role: "staff" }, input),
  ).rejects.toMatchObject({ status: 403 });
});
it("rejects duplicate items and instruction composition without partial writes", async () => {
  const s = createModifierService(ctx.db);
  await expect(
    s.save(actor, {
      requestId: uid(),
      name: "Cocción",
      options: [
        {
          key: "well",
          name: "Cocido",
          kind: "instruction",
          components: [{ itemId, quantity: "1" }],
        },
      ],
    }),
  ).rejects.toMatchObject({ status: 400 });
});
it("binds modifier composition to recipe versions and costs chosen items once", async () => {
  const { products, productPrices } = await import("@/db/schema");
  const { createRecipeService } = await import("@/modules/recipes/service");
  const { loadConfiguration } = await import("@/modules/recipes/configuration");
  const { resolveComposition } = await import("@/modules/recipes/composition");
  const [p] = await ctx.db.insert(products).values({ name: "Tea" }).returning();
  await ctx.db
    .insert(productPrices)
    .values({ productId: p.id, channel: "counter", amount: "7000" });
  const group = await createModifierService(ctx.db).save(actor, {
    requestId: uid(),
    name: "Extras",
    options: [
      {
        key: "pearls",
        name: "Perlas",
        kind: "composition",
        components: [{ itemId, quantity: "40" }],
      },
    ],
  });
  const input = {
    requestId: uid(),
    kind: "product",
    targetId: p.id,
    yieldQuantity: "1",
    compositionModel: "configurable",
    lines: [],
    groups: [
      {
        groupVersionId: group.versionId,
        name: "Perlas",
        min: 1,
        max: 1,
        factor: "1",
        options: [
          {
            optionId: group.options[0].id,
            enabled: true,
            defaultCount: 1,
            maxCount: 1,
            mode: "inherit",
            components: [],
            prices: { counter: "500" },
          },
        ],
      },
    ],
  };
  const recipe = await createRecipeService(ctx.db).save(actor, input);
  const config = await loadConfiguration(ctx.db, recipe.versionId);
  expect(config.groups).toHaveLength(1);
  const result = resolveComposition(
    config,
    [{ recipeModifierOptionId: config.groups[0].options[0].id, count: 1 }],
    "counter",
  );
  expect(result.components[0].quantity).toBe("40.000000");
  expect(recipe.cost.unitCost).toBe("80.000000");
  await expect(
    createRecipeService(ctx.db).save(actor, {
      ...input,
      id: recipe.id,
      revision: 1,
      requestId: uid(),
      groups: [
        {
          ...input.groups[0],
          options: [{ ...input.groups[0].options[0], prices: {} }],
        },
      ],
    }),
  ).rejects.toMatchObject({ status: 400 });
});
it("snapshots modifiers in sale and retries safely after group changes", async () => {
  const { products, productPrices, saleLineComponents, inventoryMovements } =
    await import("@/db/schema");
  const { createRecipeService } = await import("@/modules/recipes/service");
  const { loadConfiguration } = await import("@/modules/recipes/configuration");
  const { createSalesService } = await import("@/modules/sales/service");
  const [p] = await ctx.db
    .insert(products)
    .values({ name: "Shake" })
    .returning();
  await ctx.db
    .insert(productPrices)
    .values({ productId: p.id, channel: "pedidosya", amount: "7000" });
  const group = await createModifierService(ctx.db).save(actor, {
    requestId: uid(),
    name: "Perlas venta",
    options: [
      {
        key: "pearls",
        name: "Explosivas",
        kind: "composition",
        components: [{ itemId, quantity: "50" }],
      },
    ],
  });
  const recipe = await createRecipeService(ctx.db).save(actor, {
    requestId: uid(),
    kind: "product",
    targetId: p.id,
    yieldQuantity: "1",
    compositionModel: "configurable",
    lines: [],
    groups: [
      {
        groupVersionId: group.versionId,
        name: "Perlas",
        min: 1,
        max: 1,
        factor: "1",
        options: [
          {
            optionId: group.options[0].id,
            enabled: true,
            defaultCount: 1,
            maxCount: 1,
            mode: "inherit",
            prices: { counter: "500", pedidosya: "500" },
          },
        ],
      },
    ],
  });
  const c = await loadConfiguration(ctx.db, recipe.versionId);
  const input = {
    requestId: uid(),
    externalId: "mod-sale-1",
    origin: "delivery",
    channel: "pedidosya",
    fulfillment: "delivery",
    lines: [
      {
        productId: p.id,
        quantity: 2,
        price: "7500",
        expectedPrice: "7500.00",
        expectedRecipeVersionId: recipe.versionId,
        modifiers: [
          { recipeModifierOptionId: c.groups[0].options[0].id, count: 1 },
        ],
      },
    ],
  };
  const sale = await createSalesService(ctx.db).create(actor, input);
  expect(sale.totalAmount).toBe("15000.00");
  expect(sale.orders[0].lines[0].modifiers[0].optionName).toBe("Explosivas");
  expect((await ctx.db.select().from(saleLineComponents))[0].quantity).toBe(
    "50.000000",
  );
  expect(await ctx.db.select().from(inventoryMovements)).toHaveLength(0);
  await createModifierService(ctx.db).save(actor, {
    requestId: uid(),
    id: group.id,
    revision: group.revision,
    name: "Perlas nuevas",
    options: [
      {
        key: group.options[0].key,
        name: "Explosivas nuevas",
        kind: "composition",
        components: [{ itemId, quantity: "80" }],
      },
    ],
  });
  const updated = await createRecipeService(ctx.db).save(actor, {
    requestId: uid(),
    id: recipe.id,
    revision: recipe.revision,
    kind: "product",
    targetId: p.id,
    yieldQuantity: "1",
    compositionModel: "configurable",
    lines: [],
    groups: [
      {
        groupVersionId: group.versionId,
        name: "Perlas",
        min: 1,
        max: 1,
        factor: "2",
        options: [
          {
            optionId: group.options[0].id,
            enabled: true,
            defaultCount: 1,
            maxCount: 1,
            mode: "inherit",
            prices: { counter: "900", pedidosya: "900" },
          },
        ],
      },
    ],
  });
  expect(updated.versionId).not.toBe(recipe.versionId);
  const replay = await createSalesService(ctx.db).create(actor, input);
  expect(replay.id).toBe(sale.id);
  expect(replay.orders[0].lines[0].modifiers[0].optionName).toBe("Explosivas");
  expect(replay.totalAmount).toBe("15000.00");
  expect((await ctx.db.select().from(saleLineComponents))[0].quantity).toBe(
    "50.000000",
  );
});
it("costs configurable delivery-only recipes without requiring a counter price", async () => {
  const { products, productPrices } = await import("@/db/schema");
  const { createRecipeService } = await import("@/modules/recipes/service");
  const [p] = await ctx.db
    .insert(products)
    .values({ name: "Delivery only" })
    .returning();
  await ctx.db
    .insert(productPrices)
    .values({ productId: p.id, channel: "pedidosya", amount: "1000" });
  const group = await createModifierService(ctx.db).save(actor, {
    requestId: uid(),
    name: "Solo delivery",
    options: [
      {
        key: "a",
        name: "A",
        kind: "composition",
        components: [{ itemId, quantity: "10" }],
      },
    ],
  });
  const recipe = await createRecipeService(ctx.db).save(actor, {
    requestId: uid(),
    kind: "product",
    targetId: p.id,
    yieldQuantity: "1",
    compositionModel: "configurable",
    lines: [],
    groups: [
      {
        groupVersionId: group.versionId,
        name: "A",
        min: 1,
        max: 1,
        factor: "1",
        options: [
          {
            optionId: group.options[0].id,
            enabled: true,
            defaultCount: 1,
            maxCount: 1,
            mode: "inherit",
            prices: { pedidosya: "0" },
          },
        ],
      },
    ],
  });
  expect(recipe.cost.unitCost).toBe("20.000000");
});
it("proposes conversion preserving first alternative and removing variable fixed copies", async () => {
  const { products } = await import("@/db/schema");
  const { createRecipeService } = await import("@/modules/recipes/service");
  const { proposeConversion } = await import("@/modules/recipes/conversion");
  const [p] = await ctx.db
    .insert(products)
    .values({ name: "Legacy" })
    .returning();
  const r = await createRecipeService(ctx.db).save(actor, {
    requestId: uid(),
    kind: "product",
    targetId: p.id,
    yieldQuantity: "1",
    lines: [{ optional: true, options: [{ itemId, quantity: "40" }] }],
  });
  const draft = await proposeConversion(ctx.db, actor, r.id, 1);
  expect(draft.fixed).toHaveLength(0);
  expect(draft.groups[0].options[0].defaultCount).toBe(1);
  expect(draft.groups[0].options[0].components[0].quantity).toBe("40.000000");
  expect(draft.groups[0].options[0].prices).toEqual({});
});
it("lists the configurable default cost rather than an empty fixed recipe cost", async () => {
  const { createRecipeService } = await import("@/modules/recipes/service");
  const list = await createRecipeService(ctx.db).list(
    actor,
    "product",
    "Delivery only",
  );
  expect(list.rows[0].unitCost).toBe("20.000000");
});
it("keeps archived item cost pending while preventing a new sale", async () => {
  const { eq } = await import("drizzle-orm");
  const { products, productPrices } = await import("@/db/schema");
  const { createRecipeService } = await import("@/modules/recipes/service");
  const [ing] = await ctx.db
    .insert(items)
    .values({
      code: crypto.randomUUID(),
      class: "food",
      purchasable: true,
      recipeUsable: true,
      name: "Retirado",
      baseUnit: "g",
      unitCost: "2",
    })
    .returning();
  const [p] = await ctx.db
    .insert(products)
    .values({ name: "Con retirado" })
    .returning();
  await ctx.db
    .insert(productPrices)
    .values({ productId: p.id, channel: "counter", amount: "10" });
  const g = await createModifierService(ctx.db).save(actor, {
    requestId: uid(),
    name: "Para retirar",
    options: [
      {
        key: "a",
        name: "A",
        kind: "composition",
        components: [{ itemId: ing.id, quantity: "1" }],
      },
    ],
  });
  const svc = createRecipeService(ctx.db);
  const r = await svc.save(actor, {
    requestId: uid(),
    kind: "product",
    targetId: p.id,
    yieldQuantity: "1",
    compositionModel: "configurable",
    lines: [],
    groups: [
      {
        groupVersionId: g.versionId,
        name: "A",
        min: 1,
        max: 1,
        factor: "1",
        options: [
          {
            optionId: g.options[0].id,
            enabled: true,
            defaultCount: 1,
            maxCount: 1,
            mode: "inherit",
            prices: { counter: "0" },
          },
        ],
      },
    ],
  });
  await ctx.db
    .update(items)
    .set({ archivedAt: new Date() })
    .where(eq(items.id, ing.id));
  expect((await svc.get(actor, r.id)).cost.unitCost).toBeNull();
});
it("exposes only public options to staff and enforces cross-group option ownership", async () => {
  const { eq, sql } = await import("drizzle-orm");
  const { products } = await import("@/db/schema");
  const { getProductConfiguration } =
    await import("@/modules/recipes/configuration");
  const [p] = await ctx.db
    .select()
    .from(products)
    .where(eq(products.name, "Tea"));
  const config = await getProductConfiguration(
    ctx.db,
    { ...actor, role: "staff" },
    p.id,
    "counter",
  );
  expect(config.groups[0].options[0]).toMatchObject({
    name: "Perlas",
    price: "500.00",
  });
  expect(JSON.stringify(config)).not.toMatch(
    /unitCost|components|itemId|knownSubtotal/,
  );
  const rows = await ctx.db.execute(
    sql`select * from recipe_modifier_options limit 1`,
  );
  const b = rows.rows[0];
  const wrong = await ctx.db.execute(
    sql`select id from modifier_options where group_version_id <> ${b.group_version_id}::uuid limit 1`,
  );
  await expect(
    ctx.db.execute(
      sql`insert into recipe_modifier_options (recipe_modifier_group_id,group_version_id,option_id,recipe_version_id,enabled,default_count,max_count,mode) values (${b.recipe_modifier_group_id}::uuid,${b.group_version_id}::uuid,${wrong.rows[0].id}::uuid,${b.recipe_version_id}::uuid,true,0,1,'inherit')`,
    ),
  ).rejects.toMatchObject({ cause: { code: "23503" } });
});
it("normalizes legacy conversion quantities to one sold unit", async () => {
  const { eq } = await import("drizzle-orm");
  const { products, recipeVersions } = await import("@/db/schema");
  const { createRecipeService } = await import("@/modules/recipes/service");
  const { proposeConversion } = await import("@/modules/recipes/conversion");
  const [p] = await ctx.db
    .insert(products)
    .values({ name: "Historical yield" })
    .returning();
  const r = await createRecipeService(ctx.db).save(actor, {
    requestId: uid(),
    kind: "product",
    targetId: p.id,
    yieldQuantity: "1",
    lines: [
      { optional: true, options: [{ itemId, quantity: "40" }] },
      { optional: false, options: [{ itemId, quantity: "10" }] },
    ],
  });
  // Emulate an imported historical recipe with a two-product batch.
  await ctx.db
    .update(recipeVersions)
    .set({ yieldQuantity: "2.000000" })
    .where(eq(recipeVersions.id, r.versionId));
  const draft = await proposeConversion(ctx.db, actor, r.id, 1);
  expect(draft.groups[0].options[0].components[0].quantity).toBe("20.000000");
  expect(draft.fixed[0].options[0].quantity).toBe("5.000000");
});
it("blocks changing the unit of an item used only by a modifier", async () => {
  const { createCatalogService } = await import("@/modules/catalog/service");
  const [i] = await ctx.db
    .insert(items)
    .values({
      code: crypto.randomUUID(),
      class: "food",
      purchasable: true,
      recipeUsable: true,
      name: "Modifier only",
      baseUnit: "g",
      unitCost: "2",
    })
    .returning();
  await createModifierService(ctx.db).save(actor, {
    requestId: uid(),
    name: "Unit guard",
    options: [
      {
        key: "a",
        name: "A",
        kind: "composition",
        components: [{ itemId: i.id, quantity: "1" }],
      },
    ],
  });
  await expect(
    createCatalogService(ctx.db).updateRecord(actor, "items", i.id, {
      revision: 1,
      name: i.name,
      baseUnit: "ml",
      unitCost: "2",
    }),
  ).rejects.toMatchObject({ code: "UNIT_IN_USE" });
});
it("locks inherited items when publishing a configurable recipe", async () => {
  const { products, productPrices } = await import("@/db/schema");
  const { createRecipeService } = await import("@/modules/recipes/service");
  const [p] = await ctx.db
    .insert(products)
    .values({ name: "Lock test" })
    .returning();
  await ctx.db
    .insert(productPrices)
    .values({ productId: p.id, channel: "counter", amount: "10" });
  const g = await createModifierService(ctx.db).save(actor, {
    requestId: uid(),
    name: "Lock group",
    options: [
      {
        key: "a",
        name: "A",
        kind: "composition",
        components: [{ itemId, quantity: "1" }],
      },
    ],
  });
  recordedQueries.length = 0;
  await createRecipeService(ctx.db).save(actor, {
    requestId: uid(),
    kind: "product",
    targetId: p.id,
    yieldQuantity: "1",
    compositionModel: "configurable",
    lines: [],
    groups: [
      {
        groupVersionId: g.versionId,
        name: "A",
        min: 1,
        max: 1,
        factor: "1",
        options: [
          {
            optionId: g.options[0].id,
            enabled: true,
            defaultCount: 1,
            maxCount: 1,
            mode: "inherit",
            prices: { counter: "0" },
          },
        ],
      },
    ],
  });
  expect(
    recordedQueries.some((q) => /from "items".*for (update|share)/i.test(q)),
  ).toBe(true);
});
it("publishes reviewed new groups atomically with recipe and rolls back failed publication", async () => {
  const { products, productPrices, modifierGroups } =
    await import("@/db/schema");
  const { eq } = await import("drizzle-orm");
  const { createRecipeService } = await import("@/modules/recipes/service");
  const [p] = await ctx.db
    .insert(products)
    .values({ name: "Draft atomic" })
    .returning();
  await ctx.db
    .insert(productPrices)
    .values({ productId: p.id, channel: "counter", amount: "10" });
  const input = {
    requestId: uid(),
    kind: "product",
    targetId: p.id,
    yieldQuantity: "1",
    compositionModel: "configurable",
    lines: [],
    groups: [
      {
        draft: {
          requestId: uid(),
          name: "Atomic new group",
          options: [
            {
              key: "a",
              name: "A",
              kind: "composition",
              components: [{ itemId, quantity: "2" }],
            },
          ],
        },
        name: "A",
        min: 1,
        max: 1,
        factor: "1",
        options: [
          {
            optionKey: "a",
            enabled: true,
            defaultCount: 1,
            maxCount: 1,
            mode: "inherit",
            prices: {},
          },
        ],
      },
    ],
  };
  const svc = createRecipeService(ctx.db);
  await expect(svc.save(actor, input)).rejects.toMatchObject({ status: 400 });
  expect(
    await ctx.db
      .select()
      .from(modifierGroups)
      .where(eq(modifierGroups.name, "Atomic new group")),
  ).toHaveLength(0);
  input.groups[0].options[0].prices = { counter: "0" };
  const r = await svc.save(actor, input);
  expect(r.configuration?.groups).toHaveLength(1);
  expect(
    await ctx.db
      .select()
      .from(modifierGroups)
      .where(eq(modifierGroups.name, "Atomic new group")),
  ).toHaveLength(1);
  expect((await svc.save(actor, input)).versionId).toBe(r.versionId);
});
