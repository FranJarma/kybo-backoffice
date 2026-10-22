import { afterAll, beforeAll, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import {
  user,
  operationalUsers,
  products,
  productPrices,
  branchProducts,
  productFulfillmentVersions,
  productFulfillments,
  paymentMethods,
  sales,
  salePayments,
  branches,
  locatorAssignments,
  stockMovements,
} from "../src/db/schema";
import { createSalesService } from "../src/modules/sales/service";
import {
  assignLocator,
  createPickupService,
} from "../src/modules/pickup/service";
import { diningTables, saleOrders, saleLines } from "../src/db/sales-schema";
import { archiveBranch } from "../src/modules/branches/service";
import { publicQueue } from "../src/modules/pickup/queries";
import { executeCommand } from "../src/modules/operations/command";
import { deliverLines } from "../src/modules/fulfillment/service";
import type { Actor } from "../src/lib/access";
import { createCatalogService } from "../src/modules/catalog/service";
import { createRecipeService } from "../src/modules/recipes/service";
import { createPreparationService } from "../src/modules/preparation/service";
import { publishCombo } from "../src/modules/combos/service";
import {
  preparationStations,
  preparationRoutes,
  preparationTasks,
} from "../src/db/preparation-schema";

let c: Awaited<ReturnType<typeof createDataModelTestContext>>;
const actor: Actor = { id: "pickup-seller", role: "admin" };
const outsider: Actor = { id: "pickup-outsider", role: "staff" };
let input: Record<string, unknown>;
let key: string;
beforeAll(async () => {
  c = await createDataModelTestContext();
  actor.branchId = c.mapping.initialBranch.id;
  outsider.branchId = actor.branchId;
  for (const a of [actor, outsider]) {
    await c.db
      .insert(user)
      .values({ id: a.id, name: a.id, email: `${a.id}@test.local` });
    await c.db.insert(operationalUsers).values({ userId: a.id, role: a.role });
  }
  const [product] = await c.db
    .insert(products)
    .values({ name: "Gaseosa" })
    .returning();
  await c.db.insert(branchProducts).values({
    branchId: actor.branchId!,
    productId: product.id,
    enabled: true,
    dispatchLocationId: c.mapping.initialLocation.id,
  });
  await c.db
    .insert(productPrices)
    .values({ productId: product.id, channel: "counter", amount: "100" });
  const [v] = await c.db
    .insert(productFulfillmentVersions)
    .values({
      productId: product.id,
      version: 1,
      mode: "direct",
      itemId: c.itemId,
      quantity: "1",
    })
    .returning();
  await c.db
    .insert(productFulfillments)
    .values({ productId: product.id, versionId: v.id });
  const [method] = await c.db
    .insert(paymentMethods)
    .values({ name: "Cash", kind: "cash" })
    .returning();
  input = {
    origin: "counter",
    channel: "counter",
    fulfillment: "takeaway",
    notes: "SECRETO",
    customerName: "Martina",
    lines: [
      {
        productId: product.id,
        quantity: 1,
        price: "100",
        expectedPrice: "100.00",
        expectedFulfillmentVersionId: v.id,
      },
    ],
    payments: [{ collector: "local", methodId: method.id, amount: "100" }],
  };
  const [branch] = await c.db
    .select()
    .from(branches)
    .where(eq(branches.id, actor.branchId!));
  key = branch.publicQueueKey;
});
afterAll(async () => {
  await c?.close();
});
const create = (number: number | null) =>
  createSalesService(c.db).create(actor, {
    ...input,
    requestId: crypto.randomUUID(),
    locatorNumber: number,
  });

it("assigns atomically; duplicate claims roll back sales and payments", async () => {
  const before = await c.db.select().from(sales);
  const paidBefore = await c.db.select().from(salePayments);
  const results = await Promise.allSettled([create(1), create(1)]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.find((r) => r.status === "rejected")).toMatchObject({
    reason: { status: 409 },
  });
  expect(await c.db.select().from(sales)).toHaveLength(before.length + 1);
  expect(await c.db.select().from(salePayments)).toHaveLength(
    paidBefore.length + 1,
  );
  expect((await createPickupService(c.db).fleet(actor)).occupied).toHaveLength(
    1,
  );
  expect(await c.db.select().from(stockMovements)).toHaveLength(0);
});
it("preserves history and rejects stale returns after reassignment", async () => {
  const sale = await create(2),
    orderId = sale.orders[0].id,
    service = createPickupService(c.db);
  const [assignment] = await service.history(actor, orderId);
  const command = {
    requestId: crypto.randomUUID(),
    expectedAssignmentId: assignment.id,
    number: null,
    returnConfirmed: true,
  };
  await expect(
    service.change(actor, orderId, { ...command, returnConfirmed: false }),
  ).rejects.toMatchObject({ status: 400 });
  await service.change(actor, orderId, command);
  await service.change(actor, orderId, {
    requestId: crypto.randomUUID(),
    expectedAssignmentId: null,
    number: 2,
    returnConfirmed: false,
  });
  await service.change(actor, orderId, command);
  expect(
    (await service.history(actor, orderId)).filter((a) => !a.returnedAt),
  ).toHaveLength(1);
  await expect(
    service.change(actor, orderId, {
      ...command,
      requestId: crypto.randomUUID(),
    }),
  ).rejects.toMatchObject({ status: 409 });
  const history = await service.history(actor, orderId);
  expect(history).toHaveLength(2);
  expect(history[0]).toMatchObject({
    returnedBy: actor.id,
    assignedBy: actor.id,
  });
});
it("requires branch membership and hides all internal fields from the public queue", async () => {
  const service = createPickupService(c.db);
  await expect(service.fleet(outsider)).rejects.toMatchObject({ status: 403 });
  await expect(publicQueue(c.db, crypto.randomUUID())).rejects.toMatchObject({
    status: 404,
  });
  const queue = await publicQueue(c.db, key);
  expect(queue.rows.length).toBeGreaterThan(0);
  expect(queue.rows.every((r) => r.state === "ready")).toBe(true);
  expect(Object.keys(queue.rows[0]).sort()).toEqual([
    "customerName",
    "label",
    "locatorNumber",
    "state",
  ]);
  expect(JSON.stringify(queue)).not.toMatch(
    /SECRETO|Cash|customerId|email|phone|payments|totalAmount|actor|saleId|orderId/,
  );
  expect(queue.rows[0].customerName).toBe("Martina");
});
it("delivery consumes stock once and leaves the locator occupied until physical return", async () => {
  const sale = await create(3),
    order = sale.orders[0];
  const command = {
    requestId: crypto.randomUUID(),
    orderId: order.id,
    lines: [{ saleLineId: order.lines[0].id, quantity: 1 }],
  };
  const deliver = () =>
    executeCommand(
      c.db,
      actor,
      actor.branchId!,
      command,
      "deliver",
      command,
      async (tx, ctx, operationId) => {
        await deliverLines(tx, ctx, { ...command, operationId });
        return { delivered: true };
      },
    );
  await deliver();
  await deliver();
  const fleet = await createPickupService(c.db).fleet(actor);
  expect(fleet.occupied.some((a) => a.orderId === order.id)).toBe(true);
  expect(
    (await publicQueue(c.db, key)).rows.some(
      (r) => r.label === `${sale.number}.1`,
    ),
  ).toBe(false);
  expect(await c.db.select().from(stockMovements)).toHaveLength(1);
});
it("cancellation retains a held locator and returning allows another order to reuse it", async () => {
  const sale = await create(4);
  await createSalesService(c.db).cancel(actor, sale.id, {
    requestId: crypto.randomUUID(),
    revision: sale.revision,
    reason: "Cancelado",
    refundConfirmed: true,
  });
  const service = createPickupService(c.db),
    fleet = await service.fleet(actor);
  const held = fleet.occupied.find((a) => a.orderId === sale.orders[0].id)!;
  expect(held.cancelled).toBe(true);
  await expect(create(4)).rejects.toMatchObject({ status: 409 });
  await service.change(actor, held.orderId, {
    requestId: crypto.randomUUID(),
    expectedAssignmentId: held.id,
    number: null,
    returnConfirmed: true,
  });
  await create(4);
  expect(
    await c.db
      .select()
      .from(locatorAssignments)
      .where(eq(locatorAssignments.number, 4)),
  ).toHaveLength(2);
});
it("supports no locator and rejects numbers outside this branch's capacity", async () => {
  await create(null);
  await expect(create(17)).rejects.toMatchObject({ status: 400 });
});

it("does not resurrect historical sales without operational fulfillment", async () => {
  const [sale] = await c.db
    .insert(sales)
    .values({
      branchId: actor.branchId!,
      origin: "counter",
      channel: "counter",
      fulfillment: "takeaway",
      status: "closed",
      totalAmount: "0",
      paidAmount: "0",
      businessDate: "2025-01-01",
      actorId: actor.id,
    })
    .returning();
  const [order] = await c.db
    .insert(saleOrders)
    .values({
      branchId: actor.branchId!,
      saleId: sale.id,
      sequence: 1,
      totalAmount: "0",
      actorId: actor.id,
    })
    .returning();
  await c.db.insert(saleLines).values({
    branchId: actor.branchId!,
    orderId: order.id,
    position: 0,
    productId: (input.lines as { productId: string }[])[0].productId,
    name: "Venta histórica",
    quantity: 1,
    unitPrice: "0",
    lineTotal: "0",
  });
  expect(
    (await publicQueue(c.db, key)).rows.some(
      (r) => r.label === `${sale.number}.1`,
    ),
  ).toBe(false);
});

it("keeps held devices reachable and isolates identical numbers in different branches", async () => {
  const [branch] = await c.db
    .insert(branches)
    .values({ code: "PICKUP-B", name: "Sucursal B", timeZone: "UTC" })
    .returning();
  const otherActor = { ...actor, branchId: branch.id };
  const [sale] = await c.db
    .insert(sales)
    .values({
      branchId: branch.id,
      origin: "counter",
      channel: "counter",
      fulfillment: "takeaway",
      status: "closed",
      totalAmount: "0",
      paidAmount: "0",
      businessDate: "2026-10-22",
      actorId: actor.id,
    })
    .returning();
  const [order] = await c.db
    .insert(saleOrders)
    .values({
      branchId: branch.id,
      saleId: sale.id,
      sequence: 1,
      totalAmount: "0",
      actorId: actor.id,
    })
    .returning();
  await c.db.transaction((tx) => assignLocator(tx, otherActor, order.id, 1));
  const service = createPickupService(c.db);
  expect(
    (await service.fleet(otherActor)).occupied.map((a) => a.number),
  ).toEqual([1]);
  await expect(service.history(actor, order.id)).rejects.toMatchObject({
    status: 404,
  });
  await expect(
    service.change(actor, order.id, {
      requestId: crypto.randomUUID(),
      expectedAssignmentId: null,
      number: 2,
      returnConfirmed: false,
    }),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    archiveBranch(c.db, actor, branch.id, branch.revision),
  ).rejects.toMatchObject({ status: 409 });
});

it("waits for both stations of a mixed combo and keeps direct stock for delivery", async () => {
  const water = await createCatalogService(c.db).createRecord(actor, "items", {
    code: "PICKUP-WATER",
    name: "Agua",
    class: "beverage",
    baseUnit: "ml",
    unitCost: "0",
    purchasable: false,
    recipeUsable: true,
    stockTracked: false,
  });
  const options: {
    productId: string;
    fulfillmentVersionId: string;
    recipeVersionId: string;
  }[] = [];
  for (const name of ["Barra", "Cocina"]) {
    const [product] = await c.db
      .insert(products)
      .values({ name: `Producto ${name}` })
      .returning();
    await c.db.insert(branchProducts).values({
      branchId: actor.branchId!,
      productId: product.id,
      enabled: true,
    });
    const recipe = await createRecipeService(c.db).save(actor, {
      requestId: crypto.randomUUID(),
      compositionModel: "configurable",
      kind: "product",
      targetId: product.id,
      yieldQuantity: "1",
      groups: [],
      lines: [
        { options: [{ itemId: water.id, quantity: "100", wastePercent: "0" }] },
      ],
    });
    const [fulfillment] = await c.db
      .select()
      .from(productFulfillments)
      .where(eq(productFulfillments.productId, product.id));
    const [station] = await c.db
      .insert(preparationStations)
      .values({
        branchId: actor.branchId!,
        name,
        consumptionLocationId: c.mapping.initialLocation.id,
      })
      .returning();
    await c.db.insert(preparationRoutes).values({
      branchId: actor.branchId!,
      productId: product.id,
      stationId: station.id,
    });
    options.push({
      productId: product.id,
      fulfillmentVersionId: fulfillment.versionId,
      recipeVersionId: recipe.versionId,
    });
  }
  const [combo] = await c.db
    .insert(products)
    .values({ name: "Combo mixto", kind: "combo" })
    .returning();
  await c.db
    .insert(branchProducts)
    .values({ branchId: actor.branchId!, productId: combo.id, enabled: true });
  await c.db
    .insert(productPrices)
    .values({ productId: combo.id, channel: "counter", amount: "100" });
  const direct = (
    input.lines as { productId: string; expectedFulfillmentVersionId: string }[]
  )[0];
  const children = [
    ...options,
    {
      productId: direct.productId,
      fulfillmentVersionId: direct.expectedFulfillmentVersionId,
      recipeVersionId: null,
    },
  ];
  const definition = await publishCombo(c.db, actor, combo.id, {
    requestId: crypto.randomUUID(),
    revision: 0,
    groups: children.map((child, i) => ({
      name: `Parte ${i}`,
      quantity: 1,
      options: [{ productId: child.productId, counter: "0" }],
    })),
  });
  const sale = await createSalesService(c.db).create(actor, {
    ...input,
    requestId: crypto.randomUUID(),
    locatorNumber: 8,
    lines: [
      {
        productId: combo.id,
        quantity: 1,
        price: "100",
        expectedPrice: "100.00",
        expectedComboVersionId: definition.id,
        comboChoices: definition.groups.map((g, i) => ({
          groupId: g.id,
          optionId: g.options[0].id,
          expectedFulfillmentVersionId: children[i].fulfillmentVersionId,
          expectedRecipeVersionId: children[i].recipeVersionId,
          modifiers: [],
        })),
      },
    ],
  });
  const orderId = sale.orders[0].id;
  const state = async () =>
    (await publicQueue(c.db, key)).rows.find(
      (r) => r.label === `${sale.number}.1`,
    )?.state;
  expect(await state()).toBe("preparing");
  const tasks = await c.db
    .select()
    .from(preparationTasks)
    .where(eq(preparationTasks.orderId, orderId));
  expect(tasks).toHaveLength(2);
  const prep = createPreparationService(c.db);
  const before = (await c.db.select().from(stockMovements)).length;
  for (const [index, task] of tasks.entries()) {
    await prep.act(actor, task.id, {
      requestId: crypto.randomUUID(),
      revision: 1,
      action: "start",
    });
    await prep.act(actor, task.id, {
      requestId: crypto.randomUUID(),
      revision: 2,
      action: "ready",
    });
    expect(await state()).toBe(index === 0 ? "preparing" : "ready");
  }
  expect((await c.db.select().from(stockMovements)).length).toBe(before);
  const command = {
    requestId: crypto.randomUUID(),
    orderId,
    lines: sale.orders[0].lines
      .filter((l) => l.lineKind === "combo_component")
      .map((l) => ({ saleLineId: l.id, quantity: 1 })),
  };
  await executeCommand(
    c.db,
    actor,
    actor.branchId!,
    command,
    "deliver",
    command,
    async (tx, ctx, operationId) => {
      await deliverLines(tx, ctx, { ...command, operationId });
      return { delivered: true };
    },
  );
  expect(await state()).toBeUndefined();
  expect((await c.db.select().from(stockMovements)).length).toBe(before + 1);
});

it("assigns table rounds independently and replays without adding another order", async () => {
  const [table] = await c.db
    .insert(diningTables)
    .values({
      branchId: actor.branchId!,
      name: "Mesa prueba",
      capacity: 2,
      x: 0,
      y: 0,
    })
    .returning();
  const service = createSalesService(c.db);
  const first = {
    ...input,
    requestId: crypto.randomUUID(),
    origin: "table",
    fulfillment: "dine_in",
    tableId: table.id,
    payments: [],
    locatorNumber: 10,
  };
  const sale = await service.create(actor, first);
  expect((await service.create(actor, first)).id).toBe(sale.id);
  const next = {
    requestId: crypto.randomUUID(),
    revision: sale.revision,
    lines: input.lines,
    locatorNumber: 11,
  };
  const updated = await service.addOrder(actor, sale.id, next);
  expect(updated.orders.map((order) => order.locatorNumber)).toEqual([10, 11]);
  expect((await service.addOrder(actor, sale.id, next)).orders).toHaveLength(2);
  await expect(
    service.addOrder(actor, sale.id, {
      ...next,
      requestId: crypto.randomUUID(),
      revision: updated.revision,
      locatorNumber: 1,
    }),
  ).rejects.toMatchObject({ status: 409 });
  const after = await service.get(actor, sale.id);
  expect(after.orders).toHaveLength(2);
  expect(after.totalAmount).toBe(updated.totalAmount);
  expect(after.revision).toBe(updated.revision);
});
