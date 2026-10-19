import { afterAll, beforeAll, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import * as schema from "../src/db/schema";
import { publishCombo } from "../src/modules/combos/service";
import { publishGroup } from "../src/modules/modifiers/service";
import { createRecipeService } from "../src/modules/recipes/service";
import { getProductConfiguration } from "../src/modules/recipes/configuration";
import { createSalesService } from "../src/modules/sales/service";
import { createPreparationService } from "../src/modules/preparation/service";
import { executeCommand } from "../src/modules/operations/command";
import { deliverLines } from "../src/modules/fulfillment/service";
import { catalogProductCosts } from "../src/modules/catalog/product-costs";
import type { Actor } from "../src/lib/access";
let c: Awaited<ReturnType<typeof createDataModelTestContext>>;
const actor: Actor = { id: "combo-recipe", role: "admin" };
beforeAll(async () => {
  c = await createDataModelTestContext();
  actor.branchId = c.mapping.initialBranch.id;
  await c.db
    .insert(schema.user)
    .values({ id: actor.id, name: "Test", email: "combo-recipe@test.local" });
  await c.db
    .insert(schema.operationalUsers)
    .values({ userId: actor.id, role: "admin" });
});
afterAll(async () => {
  await c?.close();
});
it("inherits recipe waste and modifiers, consumes at preparation and dispatches soda separately", async () => {
  await c.db
    .update(schema.items)
    .set({ unitCost: "10.000000" })
    .where(eq(schema.items.id, c.itemId));
  await c.db
    .update(schema.inventoryValuations)
    .set({ value: "120.000000" })
    .where(eq(schema.inventoryValuations.itemId, c.itemId));
  const [combo, waffle, soda] = await c.db
    .insert(schema.products)
    .values([
      { name: "Waffle + gaseosa", kind: "combo" },
      { name: "Classic" },
      { name: "Gaseosa" },
    ])
    .returning();
  await c.db.insert(schema.branchProducts).values(
    [combo, waffle, soda].map((p) => ({
      branchId: actor.branchId!,
      productId: p.id,
      enabled: true,
      dispatchLocationId: c.mapping.initialLocation.id,
    })),
  );
  await c.db.insert(schema.productPrices).values(
    [combo, waffle, soda].map((p) => ({
      productId: p.id,
      channel: "counter",
      amount: p.id === combo.id ? "10000" : "8000",
    })),
  );
  const group = await c.db.transaction((tx) =>
    publishGroup(tx, actor, {
      requestId: crypto.randomUUID(),
      name: "Masa",
      options: [
        {
          key: "chipa",
          name: "Masa chipá",
          kind: "composition",
          components: [
            {
              itemId: c.itemId,
              quantity: "1",
              wastePercent: "50",
              baseUnit: "unit",
            },
          ],
        },
      ],
    }),
  );
  await createRecipeService(c.db).save(actor, {
    requestId: crypto.randomUUID(),
    kind: "product",
    targetId: waffle.id,
    yieldQuantity: "1",
    compositionModel: "configurable",
    lines: [
      {
        options: [
          {
            itemId: c.itemId,
            quantity: "1",
            wastePercent: "50",
            baseUnit: "unit",
          },
        ],
      },
    ],
    groups: [
      {
        groupVersionId: group.versionId,
        name: "Masa",
        min: 1,
        max: 1,
        factor: "1",
        options: [
          {
            optionKey: "chipa",
            enabled: true,
            defaultCount: 1,
            maxCount: 1,
            mode: "inherit",
            components: [],
            prices: { counter: "300", pedidosya: "300", ubereats: "300" },
          },
        ],
      },
    ],
  });
  const [station] = await c.db
    .insert(schema.preparationStations)
    .values({
      branchId: actor.branchId!,
      name: "Cocina",
      consumptionLocationId: c.mapping.initialLocation.id,
    })
    .returning();
  await c.db.insert(schema.preparationRoutes).values({
    branchId: actor.branchId!,
    productId: waffle.id,
    stationId: station.id,
  });
  const [v] = await c.db
    .insert(schema.productFulfillmentVersions)
    .values({
      productId: soda.id,
      version: 1,
      mode: "direct",
      itemId: c.itemId,
      quantity: "1",
    })
    .returning();
  await c.db
    .insert(schema.productFulfillments)
    .values({ productId: soda.id, versionId: v.id });
  const definition = await publishCombo(c.db, actor, combo.id, {
    requestId: crypto.randomUUID(),
    revision: 0,
    groups: [
      { name: "Waffle", quantity: 1, options: [{ productId: waffle.id }] },
      { name: "Gaseosa", quantity: 1, options: [{ productId: soda.id }] },
    ],
  });
  const config = await getProductConfiguration(
    c.db,
    actor,
    waffle.id,
    "counter",
  );
  const [method] = await c.db
    .insert(schema.paymentMethods)
    .values({ name: "Cash", kind: "cash" })
    .returning();
  const sale = await createSalesService(c.db).create(actor, {
    requestId: crypto.randomUUID(),
    origin: "counter",
    channel: "counter",
    fulfillment: "takeaway",
    payments: [{ collector: "local", methodId: method.id, amount: "10300" }],
    lines: [
      {
        productId: combo.id,
        quantity: 1,
        price: "10300",
        expectedPrice: "10300.00",
        expectedComboVersionId: definition.id,
        comboChoices: definition.groups.map((g) => ({
          groupId: g.id,
          optionId: g.options[0].id,
          expectedFulfillmentVersionId:
            g.options[0].productId === waffle.id
              ? config.fulfillmentVersionId
              : v.id,
          expectedRecipeVersionId:
            g.options[0].productId === waffle.id
              ? config.recipeVersionId
              : null,
          modifiers:
            g.options[0].productId === waffle.id
              ? [
                  {
                    recipeModifierOptionId: config.groups[0].options[0].id,
                    count: 1,
                  },
                ]
              : [],
        })),
      },
    ],
  });
  const order = sale.orders[0],
    waffleLine = order.lines.find((l) => l.productId === waffle.id)!,
    sodaLine = order.lines.find((l) => l.productId === soda.id)!;
  expect(sale.totalAmount).toBe("10300.00");
  expect(waffleLine.modifiers[0].optionName).toBe("Masa chipá");
  const components = await c.db
    .select()
    .from(schema.saleLineComponents)
    .where(eq(schema.saleLineComponents.saleLineId, waffleLine.id));
  expect(components[0].quantity).toBe("4.000000");
  expect(await c.db.select().from(schema.stockMovements)).toHaveLength(0);
  const [task] = await c.db.select().from(schema.preparationTasks);
  expect(task.stationId).toBe(station.id);
  const preparation = createPreparationService(c.db);
  await preparation.act(actor, task.id, {
    requestId: crypto.randomUUID(),
    revision: 1,
    action: "start",
  });
  await preparation.act(actor, task.id, {
    requestId: crypto.randomUUID(),
    revision: 2,
    action: "ready",
  });
  let movements = await c.db.select().from(schema.stockMovements);
  expect(movements.map((m) => m.quantity)).toEqual(["-4.000000"]);
  const payload = {
    requestId: crypto.randomUUID(),
    orderId: order.id,
    lines: [{ saleLineId: sodaLine.id, quantity: 1 }],
  };
  await executeCommand(
    c.db,
    actor,
    actor.branchId!,
    payload,
    "deliver",
    payload,
    async (tx, ctx, operationId) => {
      await deliverLines(tx, ctx, { ...payload, operationId });
      return { ok: true };
    },
  );
  movements = await c.db.select().from(schema.stockMovements);
  expect(movements).toHaveLength(2);
  expect(movements.find((m) => m.action === "direct_dispatch")?.quantity).toBe(
    "-1.000000",
  );
  const costs = await catalogProductCosts(c.db, actor, {
    ids: [combo.id, waffle.id, soda.id],
  });
  expect(costs.products.find((p) => p.productId === combo.id)?.min).toBe(
    "50.000000",
  );
  const [recipe] = await c.db
    .select()
    .from(schema.recipes)
    .where(eq(schema.recipes.productId, waffle.id));
  await createRecipeService(c.db).save(actor, {
    requestId: crypto.randomUUID(),
    id: recipe.id,
    revision: recipe.revision,
    kind: "product",
    targetId: waffle.id,
    yieldQuantity: "1",
    compositionModel: "configurable",
    lines: [
      { options: [{ itemId: c.itemId, quantity: "1", baseUnit: "unit" }] },
    ],
    groups: [],
  });
  const updated = await getProductConfiguration(
    c.db,
    actor,
    waffle.id,
    "counter",
  );
  expect(updated.recipeVersionId).not.toBe(config.recipeVersionId);
  const previous = await c.db
    .select()
    .from(schema.saleLineComponents)
    .where(eq(schema.saleLineComponents.saleLineId, waffleLine.id));
  expect(previous[0].quantity).toBe("4.000000");
  const revisedCosts = await catalogProductCosts(c.db, actor, {
    ids: [combo.id],
  });
  expect(revisedCosts.products[0].min).toBe("20.000000");
});
