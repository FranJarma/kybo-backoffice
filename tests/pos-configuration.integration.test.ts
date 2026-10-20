import { afterAll, beforeAll, expect, it } from "vitest";
import { drizzle } from "drizzle-orm/pglite";
import type { AppDb } from "../src/db/client";
import { eq } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import * as s from "../src/db/schema";
import {
  getProductConfiguration,
  loadConfiguration,
} from "../src/modules/recipes/configuration";
import type { Actor } from "../src/lib/access";
import type { SaleChannel } from "../src/modules/sales/types";

let c: Awaited<ReturnType<typeof createDataModelTestContext>>;
const actor: Actor = { id: "pos-options", role: "admin" };
let productId: string, versionId: string;
beforeAll(async () => {
  c = await createDataModelTestContext();
  actor.branchId = c.mapping.initialBranch.id;
  await c.db
    .insert(s.user)
    .values({ id: actor.id, name: "Test", email: "pos-options@test.local" });
  const [p] = await c.db.insert(s.products).values({ name: "Tea" }).returning();
  productId = p.id;
  await c.db
    .insert(s.branchProducts)
    .values({ branchId: actor.branchId!, productId, enabled: true });
  await c.db.insert(s.productPrices).values([
    { productId, channel: "counter", amount: "5000" },
    { productId, channel: "pedidosya", amount: "6000" },
  ]);
  const [r] = await c.db
    .insert(s.recipes)
    .values({ kind: "product", productId })
    .returning();
  const [v] = await c.db
    .insert(s.recipeVersions)
    .values({
      recipeId: r.id,
      version: 1,
      compositionModel: "configurable",
      outputName: p.name,
      outputUnit: "unit",
      yieldQuantity: "1",
      actorId: actor.id,
    })
    .returning();
  versionId = v.id;
  const [g] = await c.db
    .insert(s.modifierGroups)
    .values({ name: "Opciones" })
    .returning();
  const [gv] = await c.db
    .insert(s.modifierGroupVersions)
    .values({ groupId: g.id, version: 1, name: g.name, actorId: actor.id })
    .returning();
  const [binding] = await c.db
    .insert(s.recipeModifierGroups)
    .values({
      recipeVersionId: v.id,
      groupId: g.id,
      groupVersionId: gv.id,
      name: "Perlas",
      min: 0,
      max: 3,
      factor: "1",
      position: 0,
    })
    .returning();
  for (const [position, mode] of [
    "inherit",
    "override",
    "instruction",
    "disabled",
  ].entries()) {
    const [o] = await c.db
      .insert(s.modifierOptions)
      .values({
        groupVersionId: gv.id,
        key: mode,
        name: mode,
        kind: mode === "instruction" ? "instruction" : "composition",
        position,
      })
      .returning();
    const [b] = await c.db
      .insert(s.recipeModifierOptions)
      .values({
        recipeVersionId: v.id,
        recipeModifierGroupId: binding.id,
        groupVersionId: gv.id,
        optionId: o.id,
        enabled: mode !== "disabled",
        defaultCount: 0,
        maxCount: 3,
        mode: mode === "override" ? "override" : "inherit",
      })
      .returning();
    // Overrides must ignore an invalid inherited component; instructions have none.
    if (mode !== "instruction")
      await c.db.insert(s.modifierOptionComponents).values({
        optionId: o.id,
        itemId: c.itemId,
        name: "Input",
        baseUnit: mode === "override" ? "g" : "unit",
        quantity: "1",
      });
    if (mode === "override")
      await c.db.insert(s.recipeModifierOptionComponents).values({
        recipeModifierOptionId: b.id,
        itemId: c.itemId,
        name: "Input",
        baseUnit: "unit",
        quantity: "1",
      });
    await c.db.insert(s.recipeModifierOptionPrices).values([
      { recipeModifierOptionId: b.id, channel: "counter", surcharge: "0" },
      { recipeModifierOptionId: b.id, channel: "pedidosya", surcharge: "100" },
    ]);
  }
});
afterAll(async () => {
  await c?.close();
});

async function expected(channel: SaleChannel) {
  const full = await loadConfiguration(c.db, versionId);
  return full.groups.map((g) => ({
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
        maxCount: o.maxCount,
        price: o.prices[channel] ?? null,
        available: !o.components.some((c) => c.archived),
      })),
  }));
}
it("loads the sale options in at most two reads without loading the recipe graph", async () => {
  const groups = await expected("counter");
  const reads: string[] = [];
  const measured = drizzle({
    client: c.client,
    schema: s,
    logger: {
      logQuery(query) {
        if (/^select\b/i.test(query)) reads.push(query);
      },
    },
  }) as unknown as AppDb;
  const result = await getProductConfiguration(
    measured,
    actor,
    productId,
    "counter",
  );
  expect(result.groups).toEqual(groups);
  expect(result.basePrice).toBe("5000.00");
  expect(reads.length).toBeGreaterThan(0);
  expect(reads.length).toBeLessThanOrEqual(2);
});
it("preserves channel prices, inherited/override availability and stock-free instructions", async () => {
  expect(
    (await getProductConfiguration(c.db, actor, productId, "pedidosya")).groups,
  ).toEqual(await expected("pedidosya"));
  await c.db
    .update(s.items)
    .set({ archivedAt: new Date() })
    .where(eq(s.items.id, c.itemId));
  const result = await getProductConfiguration(
    c.db,
    actor,
    productId,
    "counter",
  );
  expect(result.groups).toEqual(await expected("counter"));
  expect(result.groups[0].options.map((o) => o.available)).toEqual([
    false,
    false,
    true,
  ]);
  await c.db
    .update(s.items)
    .set({ archivedAt: null, baseUnit: "g" })
    .where(eq(s.items.id, c.itemId));
  expect(
    (await getProductConfiguration(c.db, actor, productId, "counter")).groups,
  ).toEqual(await expected("counter"));
});
it("rejects products unavailable in the selected branch", async () => {
  await c.db
    .update(s.branchProducts)
    .set({ temporarilySoldOut: true })
    .where(eq(s.branchProducts.productId, productId));
  await expect(
    getProductConfiguration(c.db, actor, productId, "counter"),
  ).rejects.toThrow(/disponible/);
});
it("preserves direct sale products without a recipe or channel price", async () => {
  const [p] = await c.db
    .insert(s.products)
    .values({ name: "Direct" })
    .returning();
  await c.db
    .insert(s.branchProducts)
    .values({ productId: p.id, branchId: actor.branchId!, enabled: true });
  expect(await getProductConfiguration(c.db, actor, p.id, "counter")).toEqual({
    fulfillmentVersionId: null,
    recipeVersionId: null,
    model: "unavailable",
    groups: [],
    basePrice: null,
    catalogBasePrice: null,
    vatRate: "0.00",
    pricingRevision: 1,
  });
});
it("preserves groups with no enabled choices and missing channel surcharges", async () => {
  await c.db
    .update(s.branchProducts)
    .set({ temporarilySoldOut: false })
    .where(eq(s.branchProducts.productId, productId));
  await c.db.delete(s.recipeModifierOptionPrices);
  let result = await getProductConfiguration(c.db, actor, productId, "counter");
  expect(result.groups).toEqual(await expected("counter"));
  expect(result.groups[0].options.every((o) => o.price === null)).toBe(true);
  await c.db.update(s.recipeModifierOptions).set({ enabled: false });
  result = await getProductConfiguration(c.db, actor, productId, "counter");
  expect(result.groups).toEqual(await expected("counter"));
  expect(result.groups[0].options).toEqual([]);
});
