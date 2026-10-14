import { beforeAll, afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { user, operationalUsers } from "../src/db/auth-schema";
import {
  items,
  suppliers,
  products,
  productPrices,
  paymentMethods,
} from "../src/db/business-schema";
import { branchProducts } from "../src/db/branch-schema";
import {
  preparationStations,
  preparationRoutes,
  preparationTasks,
} from "../src/db/preparation-schema";
import { productFulfillments } from "../src/db/product-fulfillment-schema";
import { createSalesService } from "../src/modules/sales/service";
import {
  completePreparation,
  deliverLines,
} from "../src/modules/fulfillment/service";
import { inventoryValuations, stockOperations } from "../src/db/stock-schema";
import { stockMovements } from "../src/db/stock-movement-schema";
import { reservationAllocations } from "../src/db/reservation-schema";
import { createCatalogService } from "../src/modules/catalog/service";
import { createRecipeService } from "../src/modules/recipes/service";
import { createInventoryService } from "../src/modules/inventory/service";
import { createProductionService } from "../src/modules/production/service";
import { lockStock } from "../src/modules/inventory/locking";
import {
  confirmProduction,
  finishProduction,
} from "../src/modules/production/orders";
import type { Actor } from "../src/lib/access";
import type { RecipeDetail } from "../src/modules/recipes/types";

let ctx: Awaited<ReturnType<typeof createDataModelTestContext>>;
const actor: Actor = { id: "stock-tracking", role: "admin" };
let water: string, tea: string, prepared: string, recipe: RecipeDetail;
const waterFields = {
  code: "TAP-WATER",
  name: "Agua de la canilla",
  class: "beverage",
  baseUnit: "ml",
  unitCost: "0",
  purchasable: false,
  recipeUsable: true,
  stockTracked: false,
};
const now = () => new Date("2026-10-13T15:00:00Z");
beforeAll(async () => {
  ctx = await createDataModelTestContext();
  actor.branchId = ctx.mapping.initialBranch.id;
  await ctx.db
    .insert(user)
    .values({ id: actor.id, name: "Test", email: "tracking@example.test" });
  await ctx.db
    .insert(operationalUsers)
    .values({ userId: actor.id, role: "admin" });
  water = (
    await createCatalogService(ctx.db).createRecord(actor, "items", waterFields)
  ).id;
  const [t] = await ctx.db
    .insert(items)
    .values({
      code: "TRACK-TEA",
      name: "Chai seco",
      class: "food",
      baseUnit: "g",
      unitCost: "2.000000",
      purchasable: true,
      recipeUsable: true,
    })
    .returning();
  tea = t.id;
  const [p] = await ctx.db
    .insert(items)
    .values({
      code: "TRACK-CHAI",
      name: "Chai preparado",
      class: "beverage",
      baseUnit: "ml",
      purchasable: false,
      recipeUsable: true,
    })
    .returning();
  prepared = p.id;
  const [vendor] = await ctx.db
    .insert(suppliers)
    .values({ name: "Proveedor" })
    .returning();
  await createInventoryService(ctx.db, now).receive(actor, {
    requestId: randomUUID(),
    supplierId: vendor.id,
    locationId: ctx.mapping.initialLocation.id,
    receivedOn: "2026-10-13",
    lines: [{ itemId: tea, quantity: "100", unitPrice: "2" }],
  });
  recipe = await createRecipeService(ctx.db).save(actor, {
    requestId: randomUUID(),
    kind: "preparation",
    targetId: prepared,
    yieldQuantity: "1000",
    lines: [
      { options: [{ itemId: tea, quantity: "13", wastePercent: "0" }] },
      { options: [{ itemId: water, quantity: "1000", wastePercent: "0" }] },
    ],
  });
}, 60000);
afterAll(async () => {
  await ctx?.close();
});
it("permite desactivar inventario de agua ya incluida en una receta sin operaciones", async () => {
  const catalog = createCatalogService(ctx.db);
  const source = await catalog.createRecord(actor, "items", {
    ...waterFields,
    code: "WATER-ALREADY-IN-RECIPE",
    stockTracked: true,
  });
  const [output] = await ctx.db
    .insert(items)
    .values({
      code: "WATER-CHANGE-OUTPUT",
      name: "Preparación de prueba",
      class: "beverage",
      baseUnit: "ml",
      purchasable: false,
      recipeUsable: true,
    })
    .returning();
  await createRecipeService(ctx.db).save(actor, {
    requestId: randomUUID(),
    kind: "preparation",
    targetId: output.id,
    yieldQuantity: "1000",
    lines: [
      { options: [{ itemId: source.id, quantity: "1000", wastePercent: "0" }] },
    ],
  });
  await ctx.db.insert(inventoryValuations).values({
    branchId: actor.branchId!,
    itemId: source.id,
    quantity: "0.000000",
    value: "0.000000",
  });
  const updated = await catalog.updateRecord(actor, "items", source.id, {
    ...waterFields,
    code: "WATER-ALREADY-IN-RECIPE",
    revision: source.revision,
    stockTracked: false,
  });
  expect(updated.stockTracked).toBe(false);
  await expect(
    catalog.updateRecord(actor, "items", source.id, {
      ...waterFields,
      code: "WATER-ALREADY-IN-RECIPE",
      revision: updated.revision,
      baseUnit: "g",
      stockTracked: false,
    }),
  ).rejects.toMatchObject({ code: "UNIT_IN_USE" });
});
const input = () => ({
  locationId: ctx.mapping.initialLocation.id,
  recipeId: recipe.id,
  revision: recipe.revision,
  multiplier: "1",
  actualOutput: "1000",
  producedOn: "2026-10-13",
  selections: recipe.lines.map((l) => ({
    lineId: l.id,
    optionId: l.options[0].id,
    quantity: l.options[0].itemId === water ? "1000" : "13",
  })),
});
async function expectNoWaterStock() {
  expect(
    await ctx.db
      .select()
      .from(inventoryValuations)
      .where(eq(inventoryValuations.itemId, water)),
  ).toHaveLength(0);
  expect(
    await ctx.db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.itemId, water)),
  ).toHaveLength(0);
  expect(
    await ctx.db
      .select()
      .from(reservationAllocations)
      .where(eq(reservationAllocations.itemId, water)),
  ).toHaveLength(0);
}
it("produce 1 litro con 13g de chai y agua sin existencias", async () => {
  const service = createProductionService(ctx.db, now);
  const preview = await service.preview(actor, input());
  expect(preview.canConfirm).toBe(true);
  expect(preview.totalCost).toBe("26.000000");
  expect(preview.items.find((i) => i.itemId === water)?.stockTracked).toBe(
    false,
  );
  const command = {
    ...input(),
    requestId: randomUUID(),
    previewToken: preview.token,
  };
  const batch = await service.record(actor, command);
  expect(batch.totalCost).toBe("26.000000");
  expect((await service.record(actor, command)).id).toBe(batch.id);
  expect(
    (
      await ctx.db
        .select()
        .from(inventoryValuations)
        .where(eq(inventoryValuations.itemId, tea))
    )[0].quantity,
  ).toBe("87.000000");
  expect(
    (
      await ctx.db
        .select()
        .from(inventoryValuations)
        .where(eq(inventoryValuations.itemId, prepared))
    )[0].quantity,
  ).toBe("1000.000000");
  await expectNoWaterStock();
});
it("reserva y termina una orden sin reservar ni descontar agua", async () => {
  const context = {
    actorId: actor.id,
    branchId: actor.branchId!,
    timeZone: "UTC",
    role: "admin" as const,
  };
  const op = async () =>
    (
      await ctx.db
        .insert(stockOperations)
        .values({
          requestId: randomUUID(),
          branchId: actor.branchId!,
          actorId: actor.id,
          action: "test",
          fingerprint: randomUUID(),
        })
        .returning()
    )[0].id;
  const startId = await op();
  const order = await ctx.db.transaction((tx) =>
    confirmProduction(tx, context, startId, {
      recipeVersionId: recipe.versionId,
      locationId: ctx.mapping.initialLocation.id,
      plannedQuantity: "1000.000000",
      selections: input().selections.map(({ lineId, optionId }) => ({
        lineId,
        optionId,
      })),
    }),
  );
  const finishId = await op();
  const result = await ctx.db.transaction((tx) =>
    finishProduction(tx, context, finishId, order.id, {
      expectedRevision: order.revision,
      actualQuantity: "1000.000000",
      expiresOn: null,
      lotCode: null,
      reason: "Chai",
      consumption: [
        { itemId: tea, quantity: "13.000000" },
        { itemId: water, quantity: "1000.000000" },
      ],
    }),
  );
  expect(result.totalCost).toBe("26.000000");
  await expectNoWaterStock();
});
it("protege la modalidad de un ingrediente ya utilizado", async () => {
  await expect(
    createCatalogService(ctx.db).updateRecord(actor, "items", water, {
      revision: 1,
      ...waterFields,
      stockTracked: true,
    }),
  ).rejects.toThrow("modalidad");
});
it.each([false, true])(
  "prepara y entrega una venta con agua (solo agua: %s)",
  async (onlyWater) => {
    const [product] = await ctx.db
      .insert(products)
      .values({ name: `Agua venta ${onlyWater}` })
      .returning();
    await ctx.db
      .insert(productPrices)
      .values({ productId: product.id, channel: "counter", amount: "1.00" });
    await ctx.db.insert(branchProducts).values({
      branchId: actor.branchId!,
      productId: product.id,
      enabled: true,
    });
    const r = await createRecipeService(ctx.db).save(actor, {
      requestId: randomUUID(),
      compositionModel: "configurable",
      kind: "product",
      targetId: product.id,
      yieldQuantity: "1",
      groups: [],
      lines: [
        { options: [{ itemId: water, quantity: "1000", wastePercent: "0" }] },
        ...(onlyWater
          ? []
          : [
              { options: [{ itemId: tea, quantity: "13", wastePercent: "0" }] },
            ]),
      ],
    });
    const [station] = await ctx.db
      .insert(preparationStations)
      .values({
        branchId: actor.branchId!,
        name: `Barra ${onlyWater}`,
        consumptionLocationId: ctx.mapping.initialLocation.id,
      })
      .returning();
    await ctx.db.insert(preparationRoutes).values({
      branchId: actor.branchId!,
      productId: product.id,
      stationId: station.id,
    });
    const [payment] = await ctx.db
      .insert(paymentMethods)
      .values({ name: `Efectivo ${onlyWater}`, kind: "cash" })
      .returning();
    const [version] = await ctx.db
      .select()
      .from(productFulfillments)
      .where(eq(productFulfillments.productId, product.id));
    const before = (
      await ctx.db
        .select()
        .from(inventoryValuations)
        .where(eq(inventoryValuations.itemId, tea))
    )[0].quantity;
    const sale = await createSalesService(ctx.db).create(actor, {
      requestId: randomUUID(),
      origin: "counter",
      channel: "counter",
      fulfillment: "takeaway",
      lines: [
        {
          productId: product.id,
          quantity: 1,
          price: "1",
          expectedPrice: "1.00",
          expectedFulfillmentVersionId: version.versionId,
          expectedRecipeVersionId: r.versionId,
          modifiers: [],
        },
      ],
      payments: [{ collector: "local", methodId: payment.id, amount: "1" }],
    });
    const order = sale.orders[0];
    const [task] = await ctx.db
      .update(preparationTasks)
      .set({ status: "preparing", startedAt: new Date(), assigneeId: actor.id })
      .where(eq(preparationTasks.orderId, order.id))
      .returning();
    const op = (
      await ctx.db
        .insert(stockOperations)
        .values({
          requestId: randomUUID(),
          branchId: actor.branchId!,
          actorId: actor.id,
          action: "test",
          fingerprint: randomUUID(),
        })
        .returning()
    )[0].id;
    const context = {
      actorId: actor.id,
      branchId: actor.branchId!,
      timeZone: "UTC",
      role: "admin" as const,
    };
    const lines = order.lines.map((l) => ({ saleLineId: l.id, quantity: 1 }));
    await ctx.db.transaction((tx) =>
      completePreparation(tx, context, {
        operationId: op,
        taskId: task.id,
        expectedRevision: task.revision,
        lines,
      }),
    );
    await ctx.db.transaction((tx) =>
      deliverLines(tx, context, { operationId: op, orderId: order.id, lines }),
    );
    const after = (
      await ctx.db
        .select()
        .from(inventoryValuations)
        .where(eq(inventoryValuations.itemId, tea))
    )[0].quantity;
    expect(Number(after)).toBe(Number(before) - (onlyWater ? 0 : 13));
    await expectNoWaterStock();
  },
);
it("no permite producir un artículo sin control de inventario", async () => {
  await expect(
    createRecipeService(ctx.db).save(actor, {
      requestId: randomUUID(),
      kind: "preparation",
      targetId: water,
      yieldQuantity: "1000",
      lines: [
        { options: [{ itemId: tea, quantity: "13", wastePercent: "0" }] },
      ],
    }),
  ).rejects.toThrow("debe controlar");
});
it("valida la ubicación incluso cuando ningún ingrediente controla stock", async () => {
  await expect(
    ctx.db.transaction((tx) =>
      lockStock(
        tx,
        {
          actorId: actor.id,
          branchId: actor.branchId!,
          timeZone: "UTC",
          role: "admin",
        },
        [{ itemId: water, locationId: randomUUID() }],
      ),
    ),
  ).rejects.toThrow("ubicación");
  await expectNoWaterStock();
});
it("no muestra agua sin inventario como faltante en existencias", async () => {
  expect(
    (
      await createInventoryService(ctx.db, now).getStock(
        actor,
        "Agua de la canilla",
      )
    ).rows,
  ).toHaveLength(0);
});
it.each(["0.000000", "0.002000", null])(
  "produce con solo componentes sin inventario y costo %s",
  async (unitCost) => {
    const suffix = randomUUID().toUpperCase();
    const [source] = await ctx.db
      .insert(items)
      .values({
        code: `W-${suffix}`,
        name: "Agua sin inventario",
        class: "beverage",
        baseUnit: "ml",
        unitCost,
        stockTracked: false,
        purchasable: false,
        recipeUsable: true,
      })
      .returning();
    const [output] = await ctx.db
      .insert(items)
      .values({
        code: `O-${suffix}`,
        name: "Preparado con agua",
        class: "beverage",
        baseUnit: "ml",
        purchasable: false,
        recipeUsable: true,
      })
      .returning();
    const r = await createRecipeService(ctx.db).save(actor, {
      requestId: randomUUID(),
      kind: "preparation",
      targetId: output.id,
      yieldQuantity: "1000",
      lines: [
        {
          options: [{ itemId: source.id, quantity: "1000", wastePercent: "0" }],
        },
      ],
    });
    const draft = {
      ...input(),
      recipeId: r.id,
      revision: r.revision,
      selections: [
        {
          lineId: r.lines[0].id,
          optionId: r.lines[0].options[0].id,
          quantity: "1000",
        },
      ],
    };
    const service = createProductionService(ctx.db, now);
    const p = await service.preview(actor, draft);
    expect(p.canConfirm).toBe(true);
    const expected =
      unitCost === null
        ? null
        : unitCost === "0.000000"
          ? "0.000000"
          : "2.000000";
    expect(p.totalCost).toBe(expected);
    const batch = await service.record(actor, {
      ...draft,
      requestId: randomUUID(),
      previewToken: p.token,
    });
    expect(batch.totalCost).toBe(expected);
    expect(
      await ctx.db
        .select()
        .from(inventoryValuations)
        .where(eq(inventoryValuations.itemId, source.id)),
    ).toHaveLength(0);
  },
);
