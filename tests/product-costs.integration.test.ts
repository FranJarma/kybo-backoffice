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
    .values({ productId, channel: "counter", amount: "100.00" });
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
    netPrice: "5200.00",
    finalPrice: "6292.00",
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
