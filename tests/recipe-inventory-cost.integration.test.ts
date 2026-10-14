import { beforeAll, afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { user, operationalUsers } from "../src/db/auth-schema";
import { items, products, suppliers } from "../src/db/business-schema";
import { branches } from "../src/db/branch-schema";
import { inventoryValuations } from "../src/db/stock-schema";
import { createRecipeService } from "../src/modules/recipes/service";
import { previewRecipeCost } from "../src/modules/recipes/preview";
import { createInventoryService } from "../src/modules/inventory/service";
import type { Actor } from "../src/lib/access";

let ctx: Awaited<ReturnType<typeof createDataModelTestContext>>;
const actor: Actor = { id: "recipe-cost", role: "admin" };
let ingredient: string, secondBranch: string, recipeId: string;
beforeAll(async () => {
  ctx = await createDataModelTestContext();
  actor.branchId = ctx.mapping.initialBranch.id;
  await ctx.db
    .insert(user)
    .values({ id: actor.id, name: "Test", email: "cost@example.test" });
  await ctx.db
    .insert(operationalUsers)
    .values({ userId: actor.id, role: "admin" });
  const [item] = await ctx.db
    .insert(items)
    .values({
      code: "COST-TEA",
      name: "Té chai",
      class: "food",
      baseUnit: "g",
      unitCost: "1.000000",
      purchasable: true,
      recipeUsable: true,
    })
    .returning();
  ingredient = item.id;
  const [vendor] = await ctx.db
    .insert(suppliers)
    .values({ name: "Proveedor" })
    .returning();
  await createInventoryService(
    ctx.db,
    () => new Date("2026-10-13T15:00:00Z"),
  ).receive(actor, {
    requestId: randomUUID(),
    supplierId: vendor.id,
    locationId: ctx.mapping.initialLocation.id,
    receivedOn: "2026-10-13",
    lines: [{ itemId: ingredient, quantity: "100", unitPrice: "2" }],
    shipping: { amount: "20", supplierId: vendor.id, allocation: "value" },
  });
  const [branch] = await ctx.db
    .insert(branches)
    .values({ code: "COST-B", name: "Sucursal B", timeZone: "UTC" })
    .returning();
  secondBranch = branch.id;
  await ctx.db.insert(inventoryValuations).values({
    branchId: secondBranch,
    itemId: ingredient,
    quantity: "100.000000",
    value: "500.000000",
  });
  const [product] = await ctx.db
    .insert(products)
    .values({ name: "Chai de prueba" })
    .returning();
  const recipe = await createRecipeService(ctx.db).save(actor, {
    requestId: randomUUID(),
    kind: "product",
    targetId: product.id,
    yieldQuantity: "1",
    lines: [
      { options: [{ itemId: ingredient, quantity: "10", wastePercent: "20" }] },
    ],
  });
  recipeId = recipe.id;
}, 60000);
afterAll(async () => {
  await ctx?.close();
});
const preview = (who: Actor = actor) =>
  previewRecipeCost(ctx.db, who, {
    yieldQuantity: "1",
    rows: [{ itemId: ingredient, quantity: "10", wastePercent: "20" }],
  });
it("usa costo promedio con envío y merma en editor, detalle, listado y simulador", async () => {
  const p = await preview();
  expect(p.totalCost).toBe("27.500000");
  const service = createRecipeService(ctx.db);
  const detail = await service.get(actor, recipeId);
  expect(detail.cost.totalCost).toBe("27.500000");
  expect(
    (await service.list(actor)).rows.find((r) => r.id === recipeId)?.unitCost,
  ).toBe("27.500000");
  expect(
    (
      await service.cost(actor, recipeId, {
        revision: detail.revision,
        selections: [],
      })
    ).totalCost,
  ).toBe("27.500000");
  expect(
    (await ctx.db.select().from(items).where(eq(items.id, ingredient)))[0]
      .unitCost,
  ).toBe("1.000000");
});
it("aisla los costos de cada sucursal", async () => {
  expect((await preview({ ...actor, branchId: secondBranch })).totalCost).toBe(
    "62.500000",
  );
  expect((await preview()).totalCost).toBe("27.500000");
});
it("no disfraza stock de valoración pendiente con el costo de referencia", async () => {
  await ctx.db
    .update(inventoryValuations)
    .set({ value: null })
    .where(
      and(
        eq(inventoryValuations.branchId, secondBranch),
        eq(inventoryValuations.itemId, ingredient),
      ),
    );
  expect(
    (await preview({ ...actor, branchId: secondBranch })).totalCost,
  ).toBeNull();
});
it("usa la referencia cuando no hay stock", async () => {
  await ctx.db
    .update(inventoryValuations)
    .set({ quantity: "0.000000", value: "0.000000" })
    .where(
      and(
        eq(inventoryValuations.branchId, secondBranch),
        eq(inventoryValuations.itemId, ingredient),
      ),
    );
  expect((await preview({ ...actor, branchId: secondBranch })).totalCost).toBe(
    "12.500000",
  );
});
it("rechaza sucursal inexistente incluso para administrador", async () => {
  await expect(preview({ ...actor, branchId: randomUUID() })).rejects.toThrow(
    "sucursal",
  );
});
it("no expone costos de una sucursal sin acceso a gestores de catálogo", async () => {
  const manager: Actor = {
    id: "cost-catalog-manager",
    role: "manager",
    branchId: actor.branchId,
  };
  await ctx.db
    .insert(user)
    .values({
      id: manager.id,
      name: "Catálogo",
      email: "cost-manager@example.test",
    });
  await ctx.db
    .insert(operationalUsers)
    .values({ userId: manager.id, role: "manager", catalogManager: true });
  await expect(preview(manager)).rejects.toThrow("No tenés acceso");
  await expect(
    createRecipeService(ctx.db).get(manager, recipeId),
  ).rejects.toThrow("No tenés acceso");
});
it("informa referencias y admite inventario de costo cero", async () => {
  const fallback = await preview({ ...actor, branchId: secondBranch });
  expect(fallback.rows[0].source).toBe("reference");
  expect(fallback.rows[0].referenceItems).toEqual(["Té chai"]);
  await ctx.db
    .update(inventoryValuations)
    .set({ quantity: "100.000000", value: "0.000000" })
    .where(
      and(
        eq(inventoryValuations.branchId, secondBranch),
        eq(inventoryValuations.itemId, ingredient),
      ),
    );
  const free = await preview({ ...actor, branchId: secondBranch });
  expect(free.totalCost).toBe("0.000000");
  expect(free.rows[0].source).toBe("inventory");
  expect(free.rows[0].referenceItems).toEqual([]);
});
it("usa inventario también para recetas configurables", async () => {
  const service = createRecipeService(ctx.db);
  const [product] = await ctx.db
    .insert(products)
    .values({ name: "Chai configurable" })
    .returning();
  const recipe = await service.save(actor, {
    requestId: randomUUID(),
    compositionModel: "configurable",
    kind: "product",
    targetId: product.id,
    yieldQuantity: "1",
    groups: [],
    lines: [
      { options: [{ itemId: ingredient, quantity: "10", wastePercent: "20" }] },
    ],
  });
  expect(recipe.cost.totalCost).toBe("27.500000");
  expect((await service.get(actor, recipe.id)).cost.totalCost).toBe(
    "27.500000",
  );
  expect(
    (
      await service.cost(actor, recipe.id, {
        revision: recipe.revision,
        modifiers: [],
      })
    ).totalCost,
  ).toBe("27.500000");
  expect(
    (await service.list(actor)).rows.find((r) => r.id === recipe.id)?.unitCost,
  ).toBe("27.500000");
});
it("estima preparaciones sin stock y prioriza su valor producido cuando hay stock", async () => {
  const [prep] = await ctx.db
    .insert(items)
    .values({
      code: "COST-PREP",
      name: "Preparado chai",
      class: "food",
      baseUnit: "ml",
      recipeUsable: true,
      purchasable: false,
    })
    .returning();
  await createRecipeService(ctx.db).save(actor, {
    requestId: randomUUID(),
    kind: "preparation",
    targetId: prep.id,
    yieldQuantity: "100",
    lines: [
      { options: [{ itemId: ingredient, quantity: "10", wastePercent: "20" }] },
    ],
  });
  const estimate = () =>
    previewRecipeCost(ctx.db, actor, {
      yieldQuantity: "1",
      rows: [{ itemId: prep.id, quantity: "20" }],
    });
  expect((await estimate()).totalCost).toBe("5.500000");
  expect((await estimate()).rows[0].source).toBe("preparation");
  await ctx.db.insert(inventoryValuations).values({
    branchId: actor.branchId!,
    itemId: prep.id,
    quantity: "100.000000",
    value: "40.000000",
  });
  expect((await estimate()).totalCost).toBe("8.000000");
  expect((await estimate()).rows[0].source).toBe("inventory");
});
