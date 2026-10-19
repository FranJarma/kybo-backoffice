import { beforeAll, afterAll, it, expect } from "vitest";
import { eq, and } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { createCatalogService } from "../src/modules/catalog/service";
import { catalogProductCosts } from "../src/modules/catalog/product-costs";
import { productSetupOptions } from "../src/modules/products/onboarding";
import { lookupProducts } from "../src/modules/sales/product-lookup";
import { createRecipeService } from "../src/modules/recipes/service";
import { publishCombo } from "../src/modules/combos/service";
import * as s from "../src/db/schema";
import type { Actor } from "../src/lib/access";
let c: Awaited<ReturnType<typeof createDataModelTestContext>>;
let service: ReturnType<typeof createCatalogService>;
const actor: Actor = { id: "product-onboarding", role: "admin" };
let itemId: string,
  stationId: string,
  otherBranch: string,
  otherLocation: string;
const commercial = {
  priceCounter: "2500",
  pricePedidosYa: "",
  priceUberEats: "",
};
const setup = (extra: Record<string, unknown> = {}) => ({
  branchId: actor.branchId,
  mode: "direct",
  branchRevision: 0,
  expectedVersion: 0,
  dispatchLocationId: c.mapping.initialLocation.id,
  quantity: "1",
  source: { itemId },
  ...extra,
});
beforeAll(async () => {
  c = await createDataModelTestContext();
  actor.branchId = c.mapping.initialBranch.id;
  service = createCatalogService(c.db);
  await c.db
    .insert(s.user)
    .values({ id: actor.id, name: "Test", email: "onboarding@test.invalid" });
  await c.db
    .insert(s.operationalUsers)
    .values({ userId: actor.id, role: "admin" });
  [itemId] = (
    await c.db
      .insert(s.items)
      .values({
        name: "Pepsi lata",
        code: "PEPSI-LATA",
        class: "beverage",
        baseUnit: "unit",
        stockTracked: true,
        purchasable: true,
        recipeUsable: false,
        unitCost: "1400.000000",
      })
      .returning()
  ).map((r) => r.id);
  [stationId] = (
    await c.db
      .insert(s.preparationStations)
      .values({
        name: "Barra",
        branchId: actor.branchId!,
        consumptionLocationId: c.mapping.initialLocation.id,
      })
      .returning()
  ).map((r) => r.id);
  [otherBranch] = (
    await c.db
      .insert(s.branches)
      .values({ name: "Otra", code: "OTHER", timeZone: "UTC" })
      .returning()
  ).map((r) => r.id);
  [otherLocation] = (
    await c.db
      .insert(s.locations)
      .values({ branchId: otherBranch, name: "Otra ubicación", code: "OTHER" })
      .returning()
  ).map((r) => r.id);
});
afterAll(async () => {
  await c?.close();
});
it("creates a resale product, its inventory link and branch availability in one save", async () => {
  const p = await service.createRecord(actor, "products", {
    ...commercial,
    name: "Pepsi",
    kind: "individual",
    setup: setup(),
  });
  const [local] = await c.db
    .select()
    .from(s.branchProducts)
    .where(eq(s.branchProducts.productId, p.id));
  expect(local).toMatchObject({
    enabled: true,
    branchId: actor.branchId,
    dispatchLocationId: c.mapping.initialLocation.id,
  });
  const [physical] = await c.db
    .select({ v: s.productFulfillmentVersions })
    .from(s.productFulfillments)
    .innerJoin(
      s.productFulfillmentVersions,
      eq(s.productFulfillments.versionId, s.productFulfillmentVersions.id),
    )
    .where(eq(s.productFulfillments.productId, p.id));
  expect(physical.v).toMatchObject({
    mode: "direct",
    itemId,
    quantity: "1.000000",
  });
  expect(
    (await catalogProductCosts(c.db, actor, { ids: [p.id] })).products[0],
  ).toMatchObject({ status: "ready", min: "1400.000000" });
  const lookup = await c.db.transaction((tx) =>
    lookupProducts(tx, actor.branchId!, "Pepsi", "counter", "", 0),
  );
  expect(lookup.rows.find((r) => r.id === p.id)).toMatchObject({
    configured: true,
  });
});
it("creates the inventory article inline without creating fictitious stock or a recipe", async () => {
  const p = await service.createRecord(actor, "products", {
    ...commercial,
    name: "7up lata",
    setup: setup({
      source: {
        newItem: { name: "7up lata", class: "beverage", unitCost: "1200,50" },
      },
    }),
  });
  const [item] = await c.db
    .select()
    .from(s.items)
    .where(eq(s.items.name, "7up lata"));
  expect(item).toMatchObject({
    baseUnit: "unit",
    unitCost: "1200.500000",
    recipeUsable: false,
    purchasable: true,
    stockTracked: true,
  });
  expect(
    await c.db.select().from(s.recipes).where(eq(s.recipes.productId, p.id)),
  ).toHaveLength(0);
  expect(
    await c.db
      .select()
      .from(s.stockMovements)
      .where(eq(s.stockMovements.itemId, item.id)),
  ).toHaveLength(0);
  expect(
    await c.db
      .select()
      .from(s.auditEvents)
      .where(
        and(
          eq(s.auditEvents.entity, "items"),
          eq(s.auditEvents.recordId, item.id),
        ),
      ),
  ).toHaveLength(1);
});
it("completes an existing unconfigured product from the same form", async () => {
  const p = await service.createRecord(actor, "products", {
    ...commercial,
    name: "Existente",
  });
  const updated = await service.updateRecord(actor, "products", p.id, {
    ...commercial,
    name: p.name,
    revision: p.revision,
    kind: "individual",
    setup: setup(),
  });
  expect(updated.id).toBe(p.id);
  expect(updated.revision).toBe(p.revision + 1);
  expect(
    (
      await c.db
        .select()
        .from(s.branchProducts)
        .where(eq(s.branchProducts.productId, p.id))
    )[0].enabled,
  ).toBe(true);
});
it("restores the saved setup for editing and keeps an unchanged inventory link version", async () => {
  const p = await service.createRecord(actor, "products", {
    ...commercial,
    name: "Restaurar",
    setup: setup(),
  });
  const options = await productSetupOptions(c.db, actor, p.id);
  expect(options.current).toMatchObject({
    mode: "direct",
    modeLocked: true,
    itemId,
    itemName: "Pepsi lata",
    quantity: "1.000000",
    expectedVersion: 1,
    branchRevision: 1,
    enabled: true,
  });
  await service.updateRecord(actor, "products", p.id, {
    ...commercial,
    name: p.name,
    revision: p.revision,
    setup: setup({ expectedVersion: 1, branchRevision: 1 }),
  });
  expect(
    (await productSetupOptions(c.db, actor, p.id)).current?.expectedVersion,
  ).toBe(1);
});
it("rejects duplicate inline articles and incompatible inventory units atomically", async () => {
  const [weighted] = await c.db
    .insert(s.items)
    .values({
      name: "Por kilo",
      code: "BY-WEIGHT",
      class: "food",
      baseUnit: "g",
      stockTracked: true,
      purchasable: true,
      recipeUsable: true,
      unitCost: "1.000000",
    })
    .returning();
  for (const source of [
    { newItem: { name: "Pepsi lata", class: "beverage", unitCost: "100" } },
    { itemId: weighted.id },
  ]) {
    await expect(
      service.createRecord(actor, "products", {
        ...commercial,
        name: "Rechazado",
        setup: setup({ source }),
      }),
    ).rejects.toBeDefined();
    expect(
      await c.db
        .select()
        .from(s.products)
        .where(eq(s.products.name, "Rechazado")),
    ).toHaveLength(0);
  }
});
it("enables a combo or a prepared product in the selected branch and assigns its station", async () => {
  const combo = await service.createRecord(actor, "products", {
    ...commercial,
    name: "Combo",
    kind: "combo",
    setup: { branchId: actor.branchId, mode: "combo", branchRevision: 0 },
  });
  expect(
    (
      await c.db
        .select()
        .from(s.branchProducts)
        .where(eq(s.branchProducts.productId, combo.id))
    )[0].enabled,
  ).toBe(true);
  expect(
    await c.db
      .select()
      .from(s.productFulfillments)
      .where(eq(s.productFulfillments.productId, combo.id)),
  ).toHaveLength(0);
  const prepared = await service.createRecord(actor, "products", {
    ...commercial,
    name: "Preparado",
    kind: "individual",
    setup: {
      branchId: actor.branchId,
      mode: "recipe",
      branchRevision: 0,
      stationId,
      preparationRevision: 0,
    },
  });
  expect(
    (
      await c.db
        .select()
        .from(s.preparationRoutes)
        .where(eq(s.preparationRoutes.productId, prepared.id))
    )[0].stationId,
  ).toBe(stationId);
  expect(
    (
      await c.db
        .select()
        .from(s.branchProducts)
        .where(eq(s.branchProducts.productId, prepared.id))
    )[0].enabled,
  ).toBe(true);
  const lookup = await c.db.transaction((tx) =>
    lookupProducts(tx, actor.branchId!, "", "counter", "", 0),
  );
  expect(lookup.rows.find((r) => r.id === combo.id)).toMatchObject({
    configured: false,
  });
  expect(lookup.rows.find((r) => r.id === prepared.id)).toMatchObject({
    configured: false,
  });
  await createRecipeService(c.db).save(actor, {
    requestId: crypto.randomUUID(),
    kind: "product",
    targetId: prepared.id,
    yieldQuantity: "1",
    compositionModel: "configurable",
    lines: [
      { options: [{ itemId: c.itemId, quantity: "1", baseUnit: "unit" }] },
    ],
    groups: [],
  });
  await publishCombo(c.db, actor, combo.id, {
    requestId: crypto.randomUUID(),
    revision: 0,
    groups: [
      { name: "Producto", quantity: 1, options: [{ productId: prepared.id }] },
    ],
  });
  const published = await c.db.transaction((tx) =>
    lookupProducts(tx, actor.branchId!, "", "counter", "", 0),
  );
  expect(published.rows.find((r) => r.id === combo.id)).toMatchObject({
    configured: true,
  });
  expect(published.rows.find((r) => r.id === prepared.id)).toMatchObject({
    configured: true,
  });
});
it("rolls back all records when the location belongs to another branch", async () => {
  const before = await c.db.select().from(s.items);
  await expect(
    service.createRecord(actor, "products", {
      ...commercial,
      name: "No guardar",
      setup: setup({
        dispatchLocationId: otherLocation,
        source: {
          newItem: { name: "No crear", class: "beverage", unitCost: "100" },
        },
      }),
    }),
  ).rejects.toMatchObject({ status: 400 });
  expect(
    await c.db
      .select()
      .from(s.products)
      .where(eq(s.products.name, "No guardar")),
  ).toHaveLength(0);
  expect(await c.db.select().from(s.items)).toHaveLength(before.length);
});
it("rejects a branch changed since the form loaded and unauthorized branch access", async () => {
  await expect(
    service.createRecord(actor, "products", {
      ...commercial,
      name: "Sucursal incorrecta",
      setup: setup({ branchId: otherBranch }),
    }),
  ).rejects.toMatchObject({ status: 409 });
  await c.db.insert(s.user).values({
    id: "catalog-only",
    name: "Catálogo",
    email: "catalog-only@test.invalid",
  });
  await c.db
    .insert(s.operationalUsers)
    .values({ userId: "catalog-only", role: "manager", catalogManager: true });
  await expect(
    service.createRecord(
      {
        id: "catalog-only",
        role: "manager",
        catalogManager: true,
        branchId: actor.branchId,
      },
      "products",
      { ...commercial, name: "Sin acceso", setup: setup() },
    ),
  ).rejects.toMatchObject({ status: 403 });
});
it("rejects a stale branch configuration without modifying the product or duplicating an article", async () => {
  const p = await service.createRecord(actor, "products", {
    ...commercial,
    name: "Concurrencia",
    setup: setup(),
  });
  await c.db
    .update(s.branchProducts)
    .set({ revision: 2 })
    .where(eq(s.branchProducts.productId, p.id));
  await expect(
    service.updateRecord(actor, "products", p.id, {
      ...commercial,
      name: "No sobreescribir",
      revision: p.revision,
      setup: setup({
        branchRevision: 1,
        expectedVersion: 1,
        source: {
          newItem: { name: "No duplicar", class: "beverage", unitCost: "100" },
        },
      }),
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await c.db.select().from(s.products).where(eq(s.products.id, p.id)))[0]
      .name,
  ).toBe("Concurrencia");
  expect(
    await c.db.select().from(s.items).where(eq(s.items.name, "No duplicar")),
  ).toHaveLength(0);
});
