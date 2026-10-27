import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import type { AppDb } from "../src/db/client";
import type { Actor } from "../src/lib/access";
import * as s from "../src/db/schema";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { createSalesService } from "../src/modules/sales/service";
import { saleDetail } from "../src/modules/sales/queries";

let c: Awaited<ReturnType<typeof createDataModelTestContext>>;
const actor: Actor = { id: "checkout-performance", role: "admin" };
const lines: Record<string, unknown>[] = [];
let methodId: string;
let ingredientId: string;
beforeAll(async () => {
  c = await createDataModelTestContext();
  actor.branchId = c.mapping.initialBranch.id;
  await c.db.insert(s.user).values({
    id: actor.id,
    name: "Test",
    email: "checkout-performance@test.local",
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
  ingredientId = ingredients[0].id;
  for (const item of ingredients) {
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

function command(locatorNumber: number) {
  return {
    requestId: randomUUID(),
    origin: "counter",
    channel: "counter",
    fulfillment: "takeaway",
    locatorNumber,
    lines,
    payments: [{ collector: "local", methodId, amount: "200" }],
  };
}

it("rejects aggregate shortages without keeping a sale, payment, document or reservation", async () => {
  const [lot] = await c.db
    .select()
    .from(s.inventoryLots)
    .where(eq(s.inventoryLots.itemId, ingredientId));
  const [balance] = await c.db
    .select()
    .from(s.lotLocationBalances)
    .where(eq(s.lotLocationBalances.lotId, lot.id));
  const [location] = await c.db
    .select()
    .from(s.locationStockBalances)
    .where(eq(s.locationStockBalances.itemId, ingredientId));
  const before = {
    sales: await c.db.select().from(s.sales),
    payments: await c.db.select().from(s.salePayments),
    documents: await c.db.select().from(s.stockDocuments),
    reservations: await c.db.select().from(s.stockReservations),
    allocations: await c.db.select().from(s.reservationAllocations),
  };
  try {
    // Each individual drink would fit; the complete two-drink order would not.
    await c.db
      .update(s.lotLocationBalances)
      .set({ quantity: sql`${s.lotLocationBalances.reserved} + 1` })
      .where(eq(s.lotLocationBalances.lotId, lot.id));
    await c.db
      .update(s.locationStockBalances)
      .set({ quantity: sql`${s.locationStockBalances.reserved} + 1` })
      .where(eq(s.locationStockBalances.itemId, ingredientId));
    await expect(
      createSalesService(c.db).create(actor, command(2)),
    ).rejects.toMatchObject({
      code: "INSUFFICIENT_STOCK",
      message: expect.stringContaining("Insumo 0"),
    });
    expect(await c.db.select().from(s.sales)).toEqual(before.sales);
    expect(await c.db.select().from(s.salePayments)).toEqual(before.payments);
    expect(await c.db.select().from(s.stockDocuments)).toEqual(
      before.documents,
    );
    expect(await c.db.select().from(s.stockReservations)).toEqual(
      before.reservations,
    );
    expect(await c.db.select().from(s.reservationAllocations)).toEqual(
      before.allocations,
    );
  } finally {
    await c.db
      .update(s.lotLocationBalances)
      .set({ quantity: balance.quantity })
      .where(eq(s.lotLocationBalances.lotId, lot.id));
    await c.db
      .update(s.locationStockBalances)
      .set({ quantity: location.quantity })
      .where(eq(s.locationStockBalances.itemId, ingredientId));
  }
});

it("shares FEFO lots across lines and releases every allocation when cancelled", async () => {
  const lots = await c.db
    .insert(s.inventoryLots)
    .values([
      {
        itemId: ingredientId,
        receivedOn: "2026-01-01",
        expiresOn: "2099-01-01",
        initialQuantity: "0.5",
        remainingQuantity: "0.5",
      },
      {
        itemId: ingredientId,
        receivedOn: "2026-01-01",
        expiresOn: "2099-02-01",
        initialQuantity: "1",
        remainingQuantity: "1",
      },
    ])
    .returning();
  await c.db.insert(s.lotLocationBalances).values(
    lots.map((l) => ({
      lotId: l.id,
      branchId: actor.branchId!,
      locationId: c.mapping.initialLocation.id,
      quantity: l.initialQuantity,
    })),
  );
  await c.db
    .update(s.locationStockBalances)
    .set({ quantity: sql`${s.locationStockBalances.quantity} + 1.5` })
    .where(eq(s.locationStockBalances.itemId, ingredientId));
  const sale = await createSalesService(c.db).create(actor, command(3));
  const balances = await c.db.select().from(s.lotLocationBalances);
  expect(balances.find((b) => b.lotId === lots[0].id)?.reserved).toBe(
    "0.500000",
  );
  expect(balances.find((b) => b.lotId === lots[1].id)?.reserved).toBe(
    "1.000000",
  );
  const allocations = await c.db
    .select()
    .from(s.reservationAllocations)
    .where(eq(s.reservationAllocations.itemId, ingredientId));
  expect(allocations.filter((a) => a.lotId === lots[1].id)).toHaveLength(2);
  const cancelled = await createSalesService(c.db).cancel(actor, sale.id, {
    requestId: randomUUID(),
    revision: sale.revision,
    reason: "Prueba descartable",
    refundConfirmed: true,
  });
  expect(cancelled.status).toBe("cancelled");
  expect(cancelled.localCollected).toBe("0.00");
  const after = await c.db.select().from(s.lotLocationBalances);
  expect(after.find((b) => b.lotId === lots[0].id)?.reserved).toBe("0.000000");
  expect(after.find((b) => b.lotId === lots[1].id)?.reserved).toBe("0.000000");
  expect(await c.db.select().from(s.stockMovements)).toHaveLength(0);
});

it("keeps split payments in the same canonical order on creation and replay", async () => {
  const input = {
    ...command(4),
    payments: [
      { collector: "local", methodId, amount: "80" },
      { collector: "local", methodId, amount: "120" },
    ],
  };
  const sale = await createSalesService(c.db).create(actor, input);
  expect(sale.localCollected).toBe("200.00");
  expect(sale.payments).toHaveLength(2);
  expect(await createSalesService(c.db).create(actor, input)).toEqual(sale);
});
afterAll(async () => {
  await c?.close();
});

it("confirms two recipe drinks with bounded database round trips and intact reservations", async () => {
  const beforeBalances = await c.db.select().from(s.locationStockBalances);
  const beforePayments = await c.db.select().from(s.salePayments);
  const queries: string[] = [];
  const measured = drizzle({
    client: c.client,
    schema: s,
    logger: {
      logQuery(query) {
        queries.push(query);
        // Optional, deterministic network simulation for the local benchmark.
        const rtt = Number(process.env.KYBO_CHECKOUT_BENCHMARK_RTT_MS ?? 0);
        if (rtt > 0)
          Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, rtt);
      },
    },
  }) as unknown as AppDb;
  const command = {
    requestId: randomUUID(),
    origin: "counter",
    channel: "counter",
    fulfillment: "takeaway",
    locatorNumber: 1,
    lines,
    payments: [{ collector: "local", methodId, amount: "200" }],
  };
  const start = performance.now();
  const sale = await createSalesService(measured).create(actor, command);
  if (process.env.KYBO_PROFILE_CHECKOUT)
    console.info(
      "CHECKOUT_PROFILE",
      JSON.stringify({
        queries: queries.length,
        elapsedMs: Math.round(performance.now() - start),
        simulatedRttMs: Number(process.env.KYBO_CHECKOUT_BENCHMARK_RTT_MS ?? 0),
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
  expect(sale.status).toBe("closed");
  expect(sale.paidAmount).toBe("200.00");
  expect(sale.orders[0].lines).toHaveLength(2);
  expect(sale.orders[0].locatorNumber).toBe(1);
  expect(await saleDetail(c.db, sale.id)).toEqual(sale);
  const balances = await c.db
    .select()
    .from(s.locationStockBalances)
    .where(
      eq(s.locationStockBalances.locationId, c.mapping.initialLocation.id),
    );
  expect(
    balances.filter(
      (b) =>
        Number(b.reserved) -
          Number(
            beforeBalances.find(
              (p) => p.itemId === b.itemId && p.locationId === b.locationId,
            )?.reserved ?? "0",
          ) ===
        2,
    ),
  ).toHaveLength(6);
  expect(await c.db.select().from(s.stockMovements)).toHaveLength(0);
  expect((await createSalesService(c.db).create(actor, command)).id).toBe(
    sale.id,
  );
  expect(await c.db.select().from(s.salePayments)).toHaveLength(
    beforePayments.length + 1,
  );
  expect(queries.length).toBeLessThanOrEqual(50);
});
