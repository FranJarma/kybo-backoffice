import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/pglite";
import { eq, inArray } from "drizzle-orm";
import type { AppDb } from "../src/db/client";
import type { Actor } from "../src/lib/access";
import * as s from "../src/db/schema";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { createSalesService } from "../src/modules/sales/service";
import { createPreparationService } from "../src/modules/preparation/service";
import { publicQueue } from "../src/modules/pickup/queries";
import { completePreparation } from "../src/modules/fulfillment/service";
import { executeCommand } from "../src/modules/operations/command";
import { nextValuation } from "../src/modules/inventory/valuation";
import { integer, six } from "../src/modules/inventory/decimal";

let c: Awaited<ReturnType<typeof createDataModelTestContext>>;
const actor: Actor = { id: "ready-performance", role: "admin" };
const lines: Record<string, unknown>[] = [];
let methodId: string;
let ingredientIds: string[];
beforeAll(async () => {
  c = await createDataModelTestContext();
  actor.branchId = c.mapping.initialBranch.id;
  await c.db.insert(s.user).values({
    id: actor.id,
    name: "Test",
    email: "ready-performance@test.local",
  });
  await c.db
    .insert(s.operationalUsers)
    .values({ userId: actor.id, role: actor.role });
  const [method] = await c.db
    .insert(s.paymentMethods)
    .values({ name: "Efectivo", kind: "cash" })
    .returning();
  methodId = method.id;
  // Six tracked ingredients shared by two drinks, as in a normal POS order.
  const ingredients = await c.db
    .insert(s.items)
    .values(
      Array.from({ length: 6 }, (_, i) => ({
        code: `PERF-${i}`,
        name: `Insumo ${i}`,
        class: "food",
        baseUnit: "unit",
        purchasable: true,
        recipeUsable: true,
      })),
    )
    .returning();
  ingredientIds = ingredients.map((item) => item.id);
  for (const item of ingredients) {
    await c.db.insert(s.inventoryValuations).values({
      itemId: item.id,
      branchId: actor.branchId!,
      quantity: "100",
      value: "1000",
    });
    const [lot] = await c.db
      .insert(s.inventoryLots)
      .values({
        itemId: item.id,
        receivedOn: "2026-01-01",
        initialQuantity: "100",
        remainingQuantity: "100",
      })
      .returning();
    await c.db.insert(s.lotLocationBalances).values({
      lotId: lot.id,
      locationId: c.mapping.initialLocation.id,
      branchId: actor.branchId!,
      quantity: "100",
    });
    await c.db.insert(s.locationStockBalances).values({
      itemId: item.id,
      locationId: c.mapping.initialLocation.id,
      branchId: actor.branchId!,
      quantity: "100",
    });
  }
  const [station] = await c.db
    .insert(s.preparationStations)
    .values({
      branchId: actor.branchId!,
      name: "Barra",
      consumptionLocationId: c.mapping.initialLocation.id,
    })
    .returning();
  for (let i = 0; i < 2; i++) {
    const [p] = await c.db
      .insert(s.products)
      .values({ name: `Bebida ${i}` })
      .returning();
    await c.db
      .insert(s.branchProducts)
      .values({ branchId: actor.branchId!, productId: p.id, enabled: true });
    await c.db
      .insert(s.productPrices)
      .values({ productId: p.id, channel: "counter", amount: "100" });
    const [r] = await c.db
      .insert(s.recipes)
      .values({ kind: "product", productId: p.id })
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
    for (const [position, item] of ingredients.entries()) {
      const [line] = await c.db
        .insert(s.recipeLines)
        .values({ versionId: v.id, position })
        .returning();
      await c.db.insert(s.recipeOptions).values({
        lineId: line.id,
        position: 0,
        itemId: item.id,
        itemName: item.name,
        baseUnit: item.baseUnit,
        quantity: "1",
      });
    }
    const [f] = await c.db
      .insert(s.productFulfillmentVersions)
      .values({
        productId: p.id,
        version: 1,
        mode: "recipe",
        recipeVersionId: v.id,
      })
      .returning();
    await c.db
      .insert(s.productFulfillments)
      .values({ productId: p.id, versionId: f.id });
    await c.db.insert(s.preparationRoutes).values({
      branchId: actor.branchId!,
      productId: p.id,
      stationId: station.id,
    });
    lines.push({
      productId: p.id,
      quantity: 1,
      price: "100",
      expectedPrice: "100.00",
      expectedFulfillmentVersionId: f.id,
      expectedRecipeVersionId: v.id,
    });
  }
});

afterAll(async () => {
  await c?.close();
});

async function preparing(quantity = 1, locatorNumber = 1) {
  const sale = await createSalesService(c.db).create(actor, {
    requestId: randomUUID(),
    origin: "counter",
    channel: "counter",
    fulfillment: "takeaway",
    locatorNumber,
    lines: lines.map((line) => ({ ...line, quantity })),
    payments: [
      { collector: "local", methodId, amount: String(200 * quantity) },
    ],
  });
  const [task] = await c.db
    .select()
    .from(s.preparationTasks)
    .where(eq(s.preparationTasks.orderId, sale.orders[0].id));
  return createPreparationService(c.db).act(actor, task.id, {
    requestId: randomUUID(),
    revision: task.revision,
    action: "start",
  });
}

it("marks two drinks ready with bounded round trips and atomic, idempotent stock consumption", async () => {
  const started = await preparing();
  const queries: string[] = [];
  const measured = drizzle({
    client: c.client,
    schema: s,
    logger: {
      logQuery(query) {
        queries.push(query);
        const delay = Number(process.env.KYBO_READY_BENCHMARK_RTT_MS ?? 0);
        if (delay > 0)
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delay);
      },
    },
  }) as unknown as AppDb;
  const input = {
    requestId: randomUUID(),
    revision: started.task.revision,
    action: "ready",
  };
  const begin = performance.now();
  const ready = await createPreparationService(measured).act(
    actor,
    started.task.id,
    input,
  );
  console.info(
    "READY_PROFILE",
    JSON.stringify({
      queries: queries.length,
      elapsedMs: Math.round(performance.now() - begin),
      simulatedRttMs: Number(process.env.KYBO_READY_BENCHMARK_RTT_MS ?? 0),
      tables: Object.fromEntries(
        [
          ...new Set(
            queries.map(
              (q) =>
                q.match(/(?:from|into|update) "([^"]+)"/i)?.[1] ??
                q.split(" ")[0],
            ),
          ),
        ].map((table) => [
          table,
          queries.filter(
            (q) =>
              (q.match(/(?:from|into|update) "([^"]+)"/i)?.[1] ??
                q.split(" ")[0]) === table,
          ).length,
        ]),
      ),
    }),
  );
  expect(ready.task.status).toBe("ready");
  expect(ready.task.revision).toBe(started.task.revision + 1);
  const balances = await c.db
    .select()
    .from(s.locationStockBalances)
    .where(inArray(s.locationStockBalances.itemId, ingredientIds));
  expect(balances).toHaveLength(6);
  expect(
    balances.every(
      (b) => b.quantity === "98.000000" && b.reserved === "0.000000",
    ),
  ).toBe(true);
  const valuations = await c.db
    .select()
    .from(s.inventoryValuations)
    .where(inArray(s.inventoryValuations.itemId, ingredientIds));
  expect(
    valuations.every(
      (v) => v.quantity === "98.000000" && v.value === "980.000000",
    ),
  ).toBe(true);
  const movements = await c.db.select().from(s.stockMovements);
  expect(movements).toHaveLength(12);
  expect(
    movements.every(
      (m) =>
        m.action === "sale_consume" &&
        m.quantity === "-1.000000" &&
        m.value === "-10.000000",
    ),
  ).toBe(true);
  await createPreparationService(c.db).act(actor, started.task.id, input);
  expect(await c.db.select().from(s.stockMovements)).toHaveLength(12);
  expect(
    (await c.db.select().from(s.preparationEvents)).filter(
      (e) => e.action === "ready",
    ),
  ).toHaveLength(1);
  const [branch] = await c.db
    .select()
    .from(s.branches)
    .where(eq(s.branches.id, actor.branchId!));
  expect((await publicQueue(c.db, branch.publicQueueKey)).rows).toMatchObject([
    { state: "ready" },
  ]);
  expect(queries.length).toBeLessThanOrEqual(60);
});

it("preserves per-movement valuation rounding over partial completions", async () => {
  const itemId = ingredientIds[0];
  await c.db
    .update(s.inventoryValuations)
    .set({ value: "1.000001" })
    .where(eq(s.inventoryValuations.itemId, itemId));
  const [before] = await c.db
    .select()
    .from(s.inventoryValuations)
    .where(eq(s.inventoryValuations.itemId, itemId));
  const beforeMovements = await c.db
    .select()
    .from(s.stockMovements)
    .where(eq(s.stockMovements.itemId, itemId));
  const started = await preparing(3, 2);
  const command = {
    requestId: randomUUID(),
    taskId: started.task.id,
    expectedRevision: started.task.revision,
    lines: started.task.lines.map((line) => ({
      saleLineId: line.id,
      quantity: 1,
    })),
  };
  await executeCommand(
    c.db,
    actor,
    actor.branchId!,
    command,
    "ready-partial-test",
    command,
    (tx, ctx, operationId) =>
      completePreparation(tx, ctx, { ...command, operationId }),
  );
  const [partial] = await c.db
    .select()
    .from(s.preparationTasks)
    .where(eq(s.preparationTasks.id, started.task.id));
  expect(partial.status).toBe("preparing");
  await createPreparationService(c.db).act(actor, partial.id, {
    requestId: randomUUID(),
    revision: partial.revision,
    action: "ready",
  });
  let quantity = integer(before.quantity),
    value: bigint | null = integer(before.value!);
  const expected: string[] = [];
  for (const amount of [1, 1, 2, 2]) {
    const next = nextValuation(
      quantity,
      value,
      -BigInt(amount) * 1_000_000n,
      null,
    );
    quantity = next.quantity;
    value = next.value;
    expected.push(six(next.appliedValue!));
  }
  const movements = await c.db
    .select()
    .from(s.stockMovements)
    .where(eq(s.stockMovements.itemId, itemId))
    .orderBy(s.stockMovements.sequence);
  expect(movements.slice(beforeMovements.length).map((m) => m.value)).toEqual(
    expected,
  );
  const [after] = await c.db
    .select()
    .from(s.inventoryValuations)
    .where(eq(s.inventoryValuations.itemId, itemId));
  expect(after.quantity).toBe(six(quantity));
  expect(after.value).toBe(six(value!));
});

it("rolls back consumption and ready status if a reserved lot was blocked, then permits retry", async () => {
  const started = await preparing(1, 3);
  const [lot] = await c.db
    .select()
    .from(s.inventoryLots)
    .where(eq(s.inventoryLots.itemId, ingredientIds[0]));
  const before = await c.db.select().from(s.stockMovements);
  const balances = await c.db.select().from(s.locationStockBalances);
  const allocations = await c.db.select().from(s.reservationAllocations);
  const command = {
    requestId: randomUUID(),
    revision: started.task.revision,
    action: "ready",
  };
  await c.db
    .update(s.inventoryLots)
    .set({ blocked: true })
    .where(eq(s.inventoryLots.id, lot.id));
  await expect(
    createPreparationService(c.db).act(actor, started.task.id, command),
  ).rejects.toMatchObject({ code: "STOCK_CONFLICT", status: 409 });
  expect(await c.db.select().from(s.stockMovements)).toEqual(before);
  expect(await c.db.select().from(s.locationStockBalances)).toEqual(balances);
  expect(await c.db.select().from(s.reservationAllocations)).toEqual(
    allocations,
  );
  expect(
    (
      await c.db
        .select()
        .from(s.preparationTasks)
        .where(eq(s.preparationTasks.id, started.task.id))
    )[0],
  ).toMatchObject({ status: "preparing", revision: started.task.revision });
  await c.db
    .update(s.inventoryLots)
    .set({ blocked: false })
    .where(eq(s.inventoryLots.id, lot.id));
  expect(
    (await createPreparationService(c.db).act(actor, started.task.id, command))
      .task.status,
  ).toBe("ready");
  expect(await c.db.select().from(s.stockMovements)).toHaveLength(
    before.length + 12,
  );
});

it("preserves unknown inventory and movement costs when finishing a reserved preparation", async () => {
  const itemId = ingredientIds[0];
  await c.db
    .update(s.inventoryValuations)
    .set({ value: null })
    .where(eq(s.inventoryValuations.itemId, itemId));
  const started = await preparing(1, 4);
  const before = await c.db
    .select()
    .from(s.stockMovements)
    .where(eq(s.stockMovements.itemId, itemId));
  const result = await createPreparationService(c.db).act(
    actor,
    started.task.id,
    {
      requestId: randomUUID(),
      revision: started.task.revision,
      action: "ready",
    },
  );
  expect(result.task.status).toBe("ready");
  const movements = await c.db
    .select()
    .from(s.stockMovements)
    .where(eq(s.stockMovements.itemId, itemId))
    .orderBy(s.stockMovements.sequence);
  expect(movements.slice(before.length).map((m) => m.value)).toEqual([
    null,
    null,
  ]);
  expect(
    (
      await c.db
        .select()
        .from(s.inventoryValuations)
        .where(eq(s.inventoryValuations.itemId, itemId))
    )[0].value,
  ).toBeNull();
});

it("returns the locator on confirmed delivery from Comandas, preserving ready consumption and idempotent history", async () => {
  const started = await preparing(1, 5);
  const service = createPreparationService(c.db);
  const ready = await service.act(actor, started.task.id, {
    requestId: randomUUID(),
    revision: started.task.revision,
    action: "ready",
  });
  expect(ready.task.locatorNumber).toBe(5);
  const before = await c.db.select().from(s.stockMovements);
  const command = {
    requestId: randomUUID(),
    revision: ready.task.revision,
    action: "deliver",
  };
  const delivered = await service.act(actor, started.task.id, command);
  expect(delivered.task.status).toBe("delivered");
  expect(delivered.task.locatorNumber).toBeNull();
  const history = await c.db
    .select()
    .from(s.locatorAssignments)
    .where(eq(s.locatorAssignments.orderId, delivered.task.orderId));
  expect(history).toHaveLength(1);
  expect(history[0].returnedBy).toBe(actor.id);
  expect(history[0].returnedAt).not.toBeNull();
  await service.act(actor, started.task.id, command);
  expect(
    await c.db
      .select()
      .from(s.locatorAssignments)
      .where(eq(s.locatorAssignments.orderId, delivered.task.orderId)),
  ).toEqual(history);
  expect(await c.db.select().from(s.stockMovements)).toEqual(before);
});
