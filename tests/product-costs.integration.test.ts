import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { user, operationalUsers } from "../src/db/auth-schema";
import { branches } from "../src/db/branch-schema";
import { items, products } from "../src/db/business-schema";
import { inventoryValuations } from "../src/db/stock-schema";
import { createRecipeService } from "../src/modules/recipes/service";
import { publishGroup } from "../src/modules/modifiers/service";
import { catalogProductCosts } from "../src/modules/catalog/product-costs";
import {
  productFulfillments,
  productFulfillmentVersions,
} from "../src/db/product-fulfillment-schema";
import type { Actor } from "../src/lib/access";
import { eq } from "drizzle-orm";
import { paymentMethods, productPrices } from "../src/db/business-schema";
import { branchMemberships, branchProducts } from "../src/db/branch-schema";
import { publishCombo } from "../src/modules/combos/service";
import { estimateProfitability } from "../src/modules/pricing/product-profitability";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../src/db/schema";
import type { AppDb } from "../src/db/client";
import { loadConfiguration } from "../src/modules/recipes/configuration";
import { recipeDefinition } from "../src/modules/recipes/service";
import { costConfigurations } from "../src/modules/catalog/cost-configurations";
let ctx: Awaited<ReturnType<typeof createDataModelTestContext>>;
const actor: Actor = { id: "product-cost-test", role: "admin" };
let otherBranch: string,
  productId: string,
  unconfigured: string,
  direct: string;
beforeAll(async () => {
  ctx = await createDataModelTestContext();
  actor.branchId = ctx.mapping.initialBranch.id;
  await ctx.db
    .insert(user)
    .values({ id: actor.id, name: "Test", email: "costs@test.invalid" });
  await ctx.db
    .insert(operationalUsers)
    .values({ userId: actor.id, role: "admin" });
  otherBranch = (
    await ctx.db
      .insert(branches)
      .values({ code: "OTHER", name: "Otra sucursal", timeZone: "UTC" })
      .returning()
  )[0].id;
  const item = (
    await ctx.db
      .insert(items)
      .values({
        code: "COST-ITEM",
        name: "Ingrediente",
        class: "food",
        baseUnit: "g",
        unitCost: "9",
        recipeUsable: true,
        purchasable: true,
      })
      .returning()
  )[0];
  await ctx.db.insert(inventoryValuations).values([
    {
      branchId: actor.branchId!,
      itemId: item.id,
      quantity: "100",
      value: "200",
    },
    { branchId: otherBranch, itemId: item.id, quantity: "100", value: "500" },
  ]);
  [productId, unconfigured, direct] = (
    await ctx.db
      .insert(products)
      .values([{ name: "Bebida" }, { name: "Sin receta" }, { name: "Reventa" }])
      .returning()
  ).map((p) => p.id);
  const group = await ctx.db.transaction((tx) =>
    publishGroup(tx, actor, {
      requestId: randomUUID(),
      name: "Extras",
      options: [
        {
          key: "extra",
          name: "Con extra",
          kind: "composition",
          components: [
            {
              itemId: item.id,
              quantity: "5.000000",
              wastePercent: "50.00",
              baseUnit: "g",
            },
          ],
        },
        {
          key: "none",
          name: "Sin extra",
          kind: "instruction",
          instruction: "Sin extra",
          components: [],
        },
      ],
    }),
  );
  await createRecipeService(ctx.db).save(actor, {
    requestId: randomUUID(),
    kind: "product",
    targetId: productId,
    yieldQuantity: "1",
    compositionModel: "configurable",
    lines: [{ options: [{ itemId: item.id, quantity: "10", baseUnit: "g" }] }],
    groups: [
      {
        groupVersionId: group.versionId,
        name: "Extras",
        min: 1,
        max: 1,
        factor: "2",
        options: ["extra", "none"].map((key) => ({
          optionKey: key,
          enabled: true,
          defaultCount: key === "none" ? 1 : 0,
          maxCount: 1,
          mode: "inherit",
          components: [],
          prices: {},
        })),
      },
    ],
  });
  const version = (
    await ctx.db
      .insert(productFulfillmentVersions)
      .values({
        productId: direct,
        version: 1,
        mode: "direct",
        itemId: item.id,
        quantity: "3",
      })
      .returning()
  )[0];
  await ctx.db
    .insert(productFulfillments)
    .values({ productId: direct, versionId: version.id });
});
afterAll(async () => {
  await ctx?.close();
});
it("costea varias recetas con modificadores con un número acotado de lecturas", async () => {
  const [recipe] = await ctx.db
    .select()
    .from(schema.recipes)
    .where(eq(schema.recipes.productId, productId));
  const [version] = await ctx.db
    .select()
    .from(schema.recipeVersions)
    .where(eq(schema.recipeVersions.recipeId, recipe.id));
  const original = await loadConfiguration(ctx.db, version.id);
  const group = original.groups[0];
  const copies = await ctx.db
    .insert(products)
    .values(
      Array.from({ length: 5 }, (_, i) => ({ name: `Bebida en lote ${i}` })),
    )
    .returning();
  for (const copy of copies) {
    await createRecipeService(ctx.db).save(actor, {
      requestId: randomUUID(),
      kind: "product",
      targetId: copy.id,
      yieldQuantity: "1",
      compositionModel: "configurable",
      lines: [
        {
          options: [
            { itemId: original.fixed[0].itemId, quantity: "10", baseUnit: "g" },
          ],
        },
      ],
      groups: [
        {
          groupVersionId: group.groupVersionId,
          name: group.name,
          min: 1,
          max: 1,
          factor: "2",
          options: group.options.map((option) => ({
            optionKey: option.key,
            enabled: true,
            defaultCount: option.defaultCount,
            maxCount: 1,
            mode: "inherit",
            components: [],
            prices: {},
          })),
        },
      ],
    });
  }
  const reads: string[] = [];
  const measured = drizzle({
    client: ctx.client,
    schema,
    logger: {
      logQuery(query) {
        if (/^select\b/i.test(query)) reads.push(query);
      },
    },
  }) as unknown as AppDb;
  const result = await catalogProductCosts(measured, actor, {
    ids: [productId, ...copies.map((p) => p.id)],
    detail: true,
  });
  expect(result.products).toHaveLength(6);
  for (const product of result.products) {
    expect(product).toMatchObject({
      fixed: "20.000000",
      min: "20.000000",
      max: "60.000000",
      defaultCost: "20.000000",
    });
    expect(
      product.groups[0].options.find((o) => o.name === "Sin extra")?.costs[1],
    ).toBe("0.000000");
  }
  expect(reads.length).toBeLessThanOrEqual(20);
});
it("usa el costo de cada sucursal, incorpora merma y factor, y no cobra instrucciones", async () => {
  const a = await catalogProductCosts(ctx.db, actor, {
    ids: [productId],
    detail: true,
  });
  const b = await catalogProductCosts(
    ctx.db,
    { ...actor, branchId: otherBranch },
    { ids: [productId], detail: true },
  );
  expect(a.branchId).toBe(actor.branchId);
  expect(a.products[0]).toMatchObject({
    fixed: "20.000000",
    min: "20.000000",
    max: "60.000000",
    defaultCost: "20.000000",
  });
  expect(b.products[0]).toMatchObject({
    fixed: "50.000000",
    min: "50.000000",
    max: "150.000000",
  });
  expect(
    a.products[0].groups[0].options.find((o) => o.name === "Sin extra")
      ?.costs[1],
  ).toBe("0.000000");
});
it("distingue productos sin configurar y consumo directo, y omite el detalle en el resumen", async () => {
  const result = await catalogProductCosts(ctx.db, actor, {
    ids: [unconfigured, direct, productId],
  });
  expect(
    result.products.find((p) => p.productId === unconfigured)?.status,
  ).toBe("unconfigured");
  expect(result.products.find((p) => p.productId === direct)?.min).toBe(
    "6.000000",
  );
  expect(result.products.every((p) => p.groups.length === 0)).toBe(true);
});
it("exige una sucursal válida y acceso autorizado", async () => {
  await expect(
    catalogProductCosts(
      ctx.db,
      { ...actor, branchId: undefined },
      { ids: [productId] },
    ),
  ).rejects.toMatchObject({ status: 400 });
  await expect(
    catalogProductCosts(
      ctx.db,
      { ...actor, branchId: randomUUID() },
      { ids: [productId] },
    ),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    catalogProductCosts(
      ctx.db,
      { id: "unknown", role: "staff", branchId: otherBranch },
      { ids: [productId] },
    ),
  ).rejects.toMatchObject({ status: 403 });
});

it("compares profitability using branch costs, published defaults and explicit method fees", async () => {
  await ctx.db
    .update(products)
    .set({ vatRate: "21.00" })
    .where(eq(products.id, productId));
  await ctx.db
    .insert(productPrices)
    .values({ productId, channel: "counter", amount: "121.00" });
  const [card] = await ctx.db
    .insert(paymentMethods)
    .values({
      name: "Tarjeta rentabilidad",
      kind: "card",
      commissionPercent: "3.00",
    })
    .returning();
  const a = await catalogProductCosts(ctx.db, actor, {
    ids: [productId],
    profitability: true,
  });
  const b = await catalogProductCosts(
    ctx.db,
    { ...actor, branchId: otherBranch },
    { ids: [productId], profitability: true },
  );
  expect(a.profitability?.[0].basis.labels).toContain("1 × Sin extra");
  const result = estimateProfitability(a.profitability![0], "counter", {});
  expect(result).toMatchObject({
    netPrice: "100.00",
    finalPrice: "121.00",
    cost: "20.000000",
  });
  expect(result.methods.find((m) => m.id === card.id)).toMatchObject({
    commission: "3.63",
    margin: "76.37",
  });
  expect(estimateProfitability(b.profitability![0], "counter", {}).cost).toBe(
    "50.000000",
  );
  const basic = await catalogProductCosts(ctx.db, actor, { ids: [productId] });
  expect(basic.profitability).toBeUndefined();
});
it("uses included product costs and combo extras instead of individual retail prices", async () => {
  const [combo] = await ctx.db
    .insert(products)
    .values({ name: "Combo rentabilidad", kind: "combo", vatRate: "21.00" })
    .returning();
  await ctx.db.insert(productPrices).values([
    { productId: combo.id, channel: "counter", amount: "5000.00" },
    { productId: direct, channel: "counter", amount: "99999.00" },
  ]);
  await ctx.db
    .insert(branchProducts)
    .values({ branchId: actor.branchId!, productId: direct, enabled: true });
  await publishCombo(ctx.db, actor, combo.id, {
    requestId: randomUUID(),
    revision: 0,
    groups: [
      {
        name: "Bebidas",
        quantity: 2,
        options: [{ productId: direct, counter: "100.00" }],
      },
    ],
  });
  const result = await catalogProductCosts(ctx.db, actor, {
    ids: [combo.id],
    profitability: true,
  });
  const estimate = estimateProfitability(
    result.profitability![0],
    "counter",
    {},
  );
  expect(estimate).toMatchObject({
    netPrice: "4297.52",
    finalPrice: "5200.00",
    cost: "12.000000",
  });
});
it("does not expose fees to staff even when they have shared catalog access", async () => {
  const staff = {
    id: "profit-staff",
    role: "staff" as const,
    branchId: actor.branchId,
  };
  await ctx.db.insert(user).values({
    id: staff.id,
    name: "Staff",
    email: "profit-staff@test.invalid",
  });
  await ctx.db
    .insert(operationalUsers)
    .values({ userId: staff.id, role: "staff", catalogManager: true });
  await ctx.db
    .insert(branchMemberships)
    .values({ userId: staff.id, branchId: actor.branchId!, role: "staff" });
  await expect(
    catalogProductCosts(ctx.db, staff, {
      ids: [productId],
      profitability: true,
    }),
  ).rejects.toMatchObject({ status: 403 });
});
it("conserva reemplazos, merma, recargos y la configuración del lector anterior", async () => {
  const [source] = await ctx.db
    .select()
    .from(schema.recipes)
    .where(eq(schema.recipes.productId, productId));
  const [sourceVersion] = await ctx.db
    .select()
    .from(schema.recipeVersions)
    .where(eq(schema.recipeVersions.recipeId, source.id));
  const config = await loadConfiguration(ctx.db, sourceVersion.id);
  const group = config.groups[0];
  const [product] = await ctx.db
    .insert(products)
    .values({ name: "Reemplazos para costeo", vatRate: "21" })
    .returning();
  await ctx.db
    .insert(productPrices)
    .values({ productId: product.id, channel: "counter", amount: "1000" });
  const saved = await createRecipeService(ctx.db).save(actor, {
    requestId: randomUUID(),
    kind: "product",
    targetId: product.id,
    yieldQuantity: "1",
    compositionModel: "configurable",
    lines: [
      {
        options: [
          { itemId: config.fixed[0].itemId, quantity: "10", baseUnit: "g" },
        ],
      },
    ],
    groups: [
      {
        groupVersionId: group.groupVersionId,
        name: group.name,
        min: 1,
        max: 1,
        factor: "2",
        options: group.options.map((o) => ({
          optionKey: o.key,
          enabled: true,
          defaultCount: o.key === "extra" ? 1 : 0,
          maxCount: 1,
          mode: o.kind === "instruction" ? "inherit" : "override",
          components:
            o.kind === "instruction"
              ? []
              : [
                  {
                    itemId: config.fixed[0].itemId,
                    quantity: "3",
                    baseUnit: "g",
                    wastePercent: "50",
                  },
                ],
          prices: { counter: o.key === "extra" ? "25" : "0" },
        })),
      },
    ],
  });
  const definition = await recipeDefinition(ctx.db, saved.id, saved.versionId);
  const previous = await loadConfiguration(ctx.db, saved.versionId, definition);
  const [version] = await ctx.db
    .select()
    .from(schema.recipeVersions)
    .where(eq(schema.recipeVersions.id, saved.versionId));
  const bulk = (await costConfigurations(ctx.db, [version], true)).get(
    version.id,
  );
  const normalize = (value: unknown) =>
    JSON.parse(
      JSON.stringify(value, (key, v) => (key === "unitCost" ? undefined : v)),
    );
  expect(normalize(bulk)).toEqual(normalize(previous));
  const result = await catalogProductCosts(ctx.db, actor, {
    ids: [product.id],
    profitability: true,
  });
  expect(result.products[0]).toMatchObject({
    min: "20.000000",
    max: "32.000000",
    defaultCost: "32.000000",
  });
  expect(
    estimateProfitability(result.profitability![0], "counter", {}),
  ).toMatchObject({ finalPrice: "1025.00", cost: "32.000000" });
});

it("mantiene rendimiento y alternativas de las recetas anteriores", async () => {
  const [source] = await ctx.db
    .select()
    .from(schema.recipes)
    .where(eq(schema.recipes.productId, productId));
  const [version] = await ctx.db
    .select()
    .from(schema.recipeVersions)
    .where(eq(schema.recipeVersions.recipeId, source.id));
  const config = await loadConfiguration(ctx.db, version.id);
  const itemId = config.fixed[0].itemId;
  const [product] = await ctx.db
    .insert(products)
    .values({ name: "Receta anterior" })
    .returning();
  // Historical imports may have non-unit yields; the current editor publishes one sale unit.
  const [recipe] = await ctx.db
    .insert(schema.recipes)
    .values({ kind: "product", productId: product.id })
    .returning();
  const [legacy] = await ctx.db
    .insert(schema.recipeVersions)
    .values({
      recipeId: recipe.id,
      version: 1,
      compositionModel: "legacy",
      outputName: product.name,
      outputUnit: "unit",
      yieldQuantity: "2",
      actorId: actor.id,
    })
    .returning();
  const lines = await ctx.db
    .insert(schema.recipeLines)
    .values([
      { versionId: legacy.id, position: 0, optional: false },
      { versionId: legacy.id, position: 1, optional: false },
      { versionId: legacy.id, position: 2, optional: true },
    ])
    .returning();
  await ctx.db.insert(schema.recipeOptions).values([
    {
      lineId: lines[0].id,
      position: 0,
      itemId,
      itemName: "Ingrediente",
      baseUnit: "g",
      quantity: "10",
    },
    {
      lineId: lines[1].id,
      position: 0,
      itemId,
      itemName: "Ingrediente",
      baseUnit: "g",
      quantity: "4",
    },
    {
      lineId: lines[1].id,
      position: 1,
      itemId,
      itemName: "Ingrediente",
      baseUnit: "g",
      quantity: "8",
    },
    {
      lineId: lines[2].id,
      position: 0,
      itemId,
      itemName: "Ingrediente",
      baseUnit: "g",
      quantity: "2",
    },
  ]);
  const result = await catalogProductCosts(ctx.db, actor, {
    ids: [product.id],
  });
  expect(result.products[0]).toMatchObject({
    fixed: "10.000000",
    min: "14.000000",
    max: "20.000000",
    defaultCost: "16.000000",
  });
});

it("permite cincuenta resúmenes y mantiene límites menores para detalle y rentabilidad", async () => {
  const batch = await ctx.db
    .insert(products)
    .values(
      Array.from({ length: 51 }, (_, i) => ({ name: `Sin configurar ${i}` })),
    )
    .returning();
  const ids = batch.map((p) => p.id);
  expect(
    (await catalogProductCosts(ctx.db, actor, { ids: ids.slice(0, 50) }))
      .products,
  ).toHaveLength(50);
  await expect(
    catalogProductCosts(ctx.db, actor, { ids }),
  ).rejects.toHaveProperty("issues");
  await expect(
    catalogProductCosts(ctx.db, actor, { ids: ids.slice(0, 11), detail: true }),
  ).rejects.toHaveProperty("issues");
  await expect(
    catalogProductCosts(ctx.db, actor, {
      ids: ids.slice(0, 11),
      profitability: true,
    }),
  ).rejects.toHaveProperty("issues");
});

it("usa referencias sin stock y muestra pendiente si falta la valuación", async () => {
  const empty = (
    await ctx.db
      .insert(branches)
      .values({ code: "EMPTY", name: "Sin existencias", timeZone: "UTC" })
      .returning()
  )[0];
  const reference = await catalogProductCosts(
    ctx.db,
    { ...actor, branchId: empty.id },
    { ids: [productId] },
  );
  expect(reference.products[0]).toMatchObject({
    min: "90.000000",
    max: "270.000000",
    referenceItems: ["Ingrediente"],
  });
  await ctx.client.query(
    "update inventory_valuations set value=null where branch_id=$1",
    [actor.branchId],
  );
  const pending = await catalogProductCosts(ctx.db, actor, {
    ids: [productId],
    detail: true,
  });
  expect(pending.products[0]).toMatchObject({
    status: "pending",
    min: null,
    max: null,
    fixed: null,
  });
});
