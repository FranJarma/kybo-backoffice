import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { user, operationalUsers } from "../src/db/auth-schema";
import {
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
import { createCatalogService } from "../src/modules/catalog/service";
import { createRecipeService } from "../src/modules/recipes/service";
import { createSalesService } from "../src/modules/sales/service";
import { taskViews } from "../src/modules/preparation/queries";
import type { Actor } from "../src/lib/access";
let ctx: Awaited<ReturnType<typeof createDataModelTestContext>>;
beforeAll(async () => {
  ctx = await createDataModelTestContext();
});
afterAll(async () => {
  await ctx?.close();
});
it("conserva la guía del pedido confirmado y hereda la guía al editar recetas con clientes anteriores", async () => {
  const actor: Actor = {
    id: "guide-test",
    role: "admin",
    branchId: ctx.mapping.initialBranch.id,
  };
  await ctx.db
    .insert(user)
    .values({ id: actor.id, name: "Test", email: "guide@example.test" });
  await ctx.db
    .insert(operationalUsers)
    .values({ userId: actor.id, role: "admin" });
  const water = (
    await createCatalogService(ctx.db).createRecord(actor, "items", {
      code: "GUIDE-WATER",
      name: "Agua",
      class: "beverage",
      baseUnit: "ml",
      unitCost: "0",
      purchasable: false,
      recipeUsable: true,
      stockTracked: false,
    })
  ).id;
  const [product] = await ctx.db
    .insert(products)
    .values({ name: "Bebida" })
    .returning();
  await ctx.db
    .insert(productPrices)
    .values({ productId: product.id, channel: "counter", amount: "1.00" });
  await ctx.db.insert(branchProducts).values({
    branchId: actor.branchId!,
    productId: product.id,
    enabled: true,
  });
  const input = {
    compositionModel: "configurable" as const,
    kind: "product" as const,
    targetId: product.id,
    yieldQuantity: "1",
    groups: [],
    lines: [
      { options: [{ itemId: water, quantity: "100", wastePercent: "0" }] },
    ],
  };
  const guide = {
    steps: ["Servir agua", "Entregar"],
    estimatedMinutes: 2,
    observations: "Usar vaso limpio",
  };
  const service = createRecipeService(ctx.db);
  const first = await service.save(actor, {
    ...input,
    requestId: randomUUID(),
    preparation: guide,
  });
  const [station] = await ctx.db
    .insert(preparationStations)
    .values({
      branchId: actor.branchId!,
      name: "Barra",
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
    .values({ name: "Efectivo", kind: "cash" })
    .returning();
  const [fulfillment] = await ctx.db
    .select()
    .from(productFulfillments)
    .where(eq(productFulfillments.productId, product.id));
  const sale = await createSalesService(ctx.db).create(actor, {
    locatorNumber: 1,
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
        expectedFulfillmentVersionId: fulfillment.versionId,
        expectedRecipeVersionId: first.versionId,
        modifiers: [],
      },
    ],
    payments: [{ collector: "local", methodId: payment.id, amount: "1" }],
  });
  const [task] = await ctx.db
    .select()
    .from(preparationTasks)
    .where(eq(preparationTasks.orderId, sale.orders[0].id));
  const readGuide = async () =>
    (await ctx.db.transaction((tx) => taskViews(tx, [task.id])))[0].lines[0]
      .preparation;
  expect(await readGuide()).toEqual(guide);
  const changed = {
    steps: ["Servir lentamente"],
    estimatedMinutes: 3,
    observations: "",
  };
  const second = await service.save(actor, {
    ...input,
    requestId: randomUUID(),
    id: first.id,
    revision: first.revision,
    preparation: changed,
  });
  expect(second.preparation).toEqual(changed);
  expect(await readGuide()).toEqual(guide);
  const third = await service.save(actor, {
    ...input,
    requestId: randomUUID(),
    id: second.id,
    revision: second.revision,
  });
  expect(third.preparation).toEqual(changed);
});
