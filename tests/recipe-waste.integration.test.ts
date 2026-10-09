import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { user, operationalUsers } from "../src/db/auth-schema";
import { items, products } from "../src/db/business-schema";
import {
  createRecipeService,
  recipeDefinition,
} from "../src/modules/recipes/service";
import { previewRecipeCost } from "../src/modules/recipes/preview";
import { loadConfiguration } from "../src/modules/recipes/configuration";
import { resolveComposition } from "../src/modules/recipes/composition";
import { createCatalogService } from "../src/modules/catalog/service";
import type { Actor } from "../src/lib/access";
import {
  confirmProduction,
  finishProduction,
} from "../src/modules/production/orders";
import { stockOperations, locationStockBalances } from "../src/db/stock-schema";

let ctx: Awaited<ReturnType<typeof createDataModelTestContext>>;
const actor: Actor = { id: "waste-test", role: "admin" };
let ingredient: string;
beforeAll(async () => {
  ctx = await createDataModelTestContext();
  await ctx.db
    .insert(user)
    .values({ id: actor.id, name: "Test", email: "waste@example.test" });
  await ctx.db
    .insert(operationalUsers)
    .values({ userId: actor.id, role: "admin" });
  ingredient = ctx.itemId;
  await ctx.db
    .update(items)
    .set({ unitCost: "2.000000" })
    .where(eq(items.id, ingredient));
}, 60000);
afterAll(async () => {
  await ctx?.close();
});

describe("merma versionada y costos", () => {
  it("separa ingredientes de descartables sin excluirlos del costo de la receta", async () => {
    const records = await ctx.db
      .insert(items)
      .values([
        {
          code: "ORG-MILK",
          name: "Organización leche",
          class: "beverage",
          baseUnit: "ml",
          recipeUsable: true,
          purchasable: true,
          unitCost: "2.000000",
        },
        {
          code: "ORG-CUP",
          name: "Organización vaso",
          class: "packaging",
          baseUnit: "unit",
          recipeUsable: true,
          purchasable: true,
          unitCost: "10.000000",
        },
        {
          code: "ORG-CLEAN",
          name: "Organización limpieza",
          class: "cleaning",
          baseUnit: "ml",
          recipeUsable: false,
          purchasable: true,
        },
        {
          code: "ORG-RESALE",
          name: "Organización bebida reventa",
          class: "beverage",
          baseUnit: "unit",
          recipeUsable: false,
          purchasable: true,
        },
      ])
      .returning();
    const catalog = createCatalogService(ctx.db);
    const all = await catalog.listRecords(actor, "items", "Organización");
    const ingredients = await catalog.listRecords(
      actor,
      "items",
      "Organización",
      false,
      false,
      "ingredients",
    );
    const recipe = await catalog.listRecords(
      actor,
      "items",
      "Organización",
      false,
      false,
      "recipe",
    );
    const disposables = await catalog.listRecords(
      actor,
      "items",
      "Organización",
      false,
      false,
      "",
      "packaging",
    );
    expect(all.total).toBe(4);
    expect(ingredients.total).toBe(1);
    expect(ingredients.rows[0].id).toBe(records[0].id);
    expect(recipe.total).toBe(2);
    expect(disposables.total).toBe(1);
    expect(disposables.rows[0].id).toBe(records[1].id);
    const preview = await previewRecipeCost(ctx.db, actor, {
      yieldQuantity: "1",
      rows: [
        { itemId: records[0].id, quantity: "100", wastePercent: "0" },
        { itemId: records[1].id, quantity: "1", wastePercent: "0" },
      ],
    });
    expect(preview.totalCost).toBe("210.000000");
  });
  it("opciones no seleccionadas no vuelven pendiente una receta de costo cero", async () => {
    const result = await previewRecipeCost(ctx.db, actor, {
      yieldQuantity: "1",
      rows: [
        { itemId: ingredient, quantity: "", wastePercent: "0", include: false },
      ],
    });
    expect(result.totalCost).toBe("0.000000");
    expect(result.unitCost).toBe("0.000000");
  });
  it("reserva el consumo con merma y descuenta una sola vez al finalizar", async () => {
    const branchId = ctx.mapping.initialBranch.id;
    const locationId = ctx.mapping.initialLocation.id;
    const context = {
      actorId: actor.id,
      branchId,
      timeZone: "UTC",
      role: "admin" as const,
    };
    const [output] = await ctx.db
      .insert(items)
      .values({
        code: "WASTE-ORDER",
        name: "Producción merma",
        class: "food",
        baseUnit: "unit",
        recipeUsable: true,
        purchasable: false,
      })
      .returning();
    const recipe = await createRecipeService(ctx.db).save(actor, {
      requestId: randomUUID(),
      kind: "preparation",
      targetId: output.id,
      yieldQuantity: "1",
      lines: [
        {
          options: [{ itemId: ingredient, quantity: "4", wastePercent: "20" }],
        },
      ],
    });
    const op = async () =>
      (
        await ctx.db
          .insert(stockOperations)
          .values({
            requestId: randomUUID(),
            branchId,
            actorId: actor.id,
            action: "test",
            fingerprint: randomUUID(),
          })
          .returning()
      )[0].id;
    const confirmId = await op();
    const order = await ctx.db.transaction((tx) =>
      confirmProduction(tx, context, confirmId, {
        recipeVersionId: recipe.versionId,
        locationId,
        plannedQuantity: "1.000000",
        selections: [
          {
            lineId: recipe.lines[0].id,
            optionId: recipe.lines[0].options[0].id,
          },
        ],
      }),
    );
    const [reserved] = await ctx.db
      .select()
      .from(locationStockBalances)
      .where(eq(locationStockBalances.itemId, ingredient));
    expect(reserved.quantity).toBe("12.000000");
    expect(reserved.reserved).toBe("5.000000");
    const finishId = await op();
    await ctx.db.transaction((tx) =>
      finishProduction(tx, context, finishId, order.id, {
        expectedRevision: order.revision,
        actualQuantity: "1.000000",
        outcome: "completed",
        expiresOn: null,
        lotCode: null,
        reason: "Prueba de merma",
        consumption: [{ itemId: ingredient, quantity: "5.000000" }],
      }),
    );
    const [finished] = await ctx.db
      .select()
      .from(locationStockBalances)
      .where(eq(locationStockBalances.itemId, ingredient));
    expect(finished.quantity).toBe("7.000000");
    expect(finished.reserved).toBe("0.000000");
  });
  it("preview coincide con receta guardada y conserva versiones previas", async () => {
    const [p] = await ctx.db
      .insert(products)
      .values({ name: "Producto merma" })
      .returning();
    const service = createRecipeService(ctx.db);
    const input = {
      requestId: randomUUID(),
      kind: "product",
      targetId: p.id,
      yieldQuantity: "1",
      lines: [
        {
          options: [
            { itemId: ingredient, quantity: "100", wastePercent: "20" },
          ],
        },
      ],
    };
    const preview = await previewRecipeCost(ctx.db, actor, {
      yieldQuantity: "1",
      rows: [{ itemId: ingredient, quantity: "100", wastePercent: "20" }],
    });
    const saved = await service.save(actor, input);
    expect(saved.lines[0].options[0].wastePercent).toBe("20.00");
    expect(saved.cost.totalCost).toBe("250.000000");
    expect(preview.totalCost).toBe(saved.cost.totalCost);
    expect(preview.rows[0].consumption).toBe("125.000000");
    const composition = resolveComposition(
      await loadConfiguration(ctx.db, saved.versionId),
      [],
    );
    expect(composition.components[0].quantity).toBe("125.000000");
    expect(composition.components[0].wastePercent).toBe("0.00");
    await service.save(actor, {
      ...input,
      requestId: randomUUID(),
      id: saved.id,
      revision: saved.revision,
      lines: [
        {
          options: [{ itemId: ingredient, quantity: "100", wastePercent: "0" }],
        },
      ],
    });
    const old = await recipeDefinition(ctx.db, saved.id, saved.versionId);
    expect(old.lines[0].options[0].wastePercent).toBe("20.00");
  });
  it("los costos desconocidos y cantidades incompletas no se convierten en cero", async () => {
    await ctx.db
      .update(items)
      .set({ unitCost: null })
      .where(eq(items.id, ingredient));
    const result = await previewRecipeCost(ctx.db, actor, {
      yieldQuantity: "1",
      rows: [{ itemId: ingredient, quantity: "100", wastePercent: "10" }],
    });
    expect(result.totalCost).toBeNull();
    expect(result.rows[0].status).toBe("missing-cost");
    const invalid = await previewRecipeCost(ctx.db, actor, {
      yieldQuantity: "1",
      rows: [{ itemId: ingredient, quantity: "100", wastePercent: "100" }],
    });
    expect(invalid.totalCost).toBeNull();
    expect(invalid.rows[0].consumption).toBeNull();
    await ctx.db
      .update(items)
      .set({ unitCost: "2.000000" })
      .where(eq(items.id, ingredient));
  });
  it("preview y guardado incorporan la merma de preparaciones anidadas", async () => {
    const [prep] = await ctx.db
      .insert(items)
      .values({
        code: "WASTE-PREP",
        name: "Preparado",
        class: "food",
        baseUnit: "unit",
        recipeUsable: true,
        purchasable: false,
      })
      .returning();
    await createRecipeService(ctx.db).save(actor, {
      requestId: randomUUID(),
      kind: "preparation",
      targetId: prep.id,
      yieldQuantity: "10",
      lines: [
        {
          options: [
            { itemId: ingredient, quantity: "100", wastePercent: "20" },
          ],
        },
      ],
    });
    const result = await previewRecipeCost(ctx.db, actor, {
      yieldQuantity: "1",
      rows: [{ itemId: prep.id, quantity: "4", wastePercent: "20" }],
    });
    expect(result.rows[0].consumption).toBe("5.000000");
    expect(result.totalCost).toBe("125.000000");
  });
  it("Ingredientes filtra antes del conteo y comparte los registros del catálogo", async () => {
    await ctx.db.insert(items).values({
      code: "WASTE-CLEAN",
      name: "Limpieza",
      class: "cleaning",
      baseUnit: "ml",
      recipeUsable: false,
      purchasable: true,
    });
    const result = await createCatalogService(ctx.db).listRecords(
      actor,
      "items",
      "",
      false,
      true,
    );
    expect(result.rows.some((r) => r.id === ingredient)).toBe(true);
    expect(result.rows.every((r) => r.recipeUsable === true)).toBe(true);
    expect(result.total).toBe(result.rows.length);
  });
});
