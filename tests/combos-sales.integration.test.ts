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
  saleLineFulfillments,
  saleLines,
  paymentMethods,
} from "../src/db/schema";
import { publishCombo } from "../src/modules/combos/service";
import { createSalesService } from "../src/modules/sales/service";
import { executeCommand } from "../src/modules/operations/command";
import { deliverLines } from "../src/modules/fulfillment/service";
import { stockMovements } from "../src/db/stock-movement-schema";
import type { Actor } from "../src/lib/access";
let c: Awaited<ReturnType<typeof createDataModelTestContext>>;
const actor: Actor = { id: "combo-seller", role: "admin" };
let input: Record<string, unknown>;
beforeAll(async () => {
  c = await createDataModelTestContext();
  actor.branchId = c.mapping.initialBranch.id;
  await c.db
    .insert(user)
    .values({ id: actor.id, name: "Test", email: "combo-sales@test.local" });
  await c.db
    .insert(operationalUsers)
    .values({ userId: actor.id, role: "admin" });
  const [combo, child] = await c.db
    .insert(products)
    .values([{ name: "Combo", kind: "combo" }, { name: "Gaseosa" }])
    .returning();
  await c.db.insert(branchProducts).values(
    [combo, child].map((p) => ({
      branchId: actor.branchId!,
      productId: p.id,
      enabled: true,
      dispatchLocationId: c.mapping.initialLocation.id,
    })),
  );
  await c.db.insert(productPrices).values([
    { productId: combo.id, channel: "counter", amount: "10000" },
    { productId: child.id, channel: "counter", amount: "8000" },
  ]);
  const [v] = await c.db
    .insert(productFulfillmentVersions)
    .values({
      productId: child.id,
      version: 1,
      mode: "direct",
      itemId: c.itemId,
      quantity: "1",
    })
    .returning();
  await c.db
    .insert(productFulfillments)
    .values({ productId: child.id, versionId: v.id });
  const definition = await publishCombo(c.db, actor, combo.id, {
    requestId: crypto.randomUUID(),
    revision: 0,
    groups: [
      {
        name: "Primera",
        quantity: 1,
        options: [{ productId: child.id, counter: "500" }],
      },
      {
        name: "Segunda",
        quantity: 1,
        options: [{ productId: child.id, counter: "200" }],
      },
    ],
  });
  const [method] = await c.db
    .insert(paymentMethods)
    .values({ name: "Cash", kind: "cash" })
    .returning();
  input = {
    payments: [{ collector: "local", methodId: method.id, amount: "21400" }],
    requestId: crypto.randomUUID(),
    origin: "counter",
    channel: "counter",
    fulfillment: "takeaway",
    lines: [
      {
        productId: combo.id,
        quantity: 2,
        price: "10700",
        expectedPrice: "10700.00",
        expectedComboVersionId: definition.id,
        comboChoices: definition.groups.map((g) => ({
          groupId: g.id,
          optionId: g.options[0].id,
          expectedFulfillmentVersionId: v.id,
          expectedRecipeVersionId: null,
          modifiers: [],
        })),
      },
    ],
  };
});
afterAll(async () => {
  await c?.close();
});
it("charges once, reserves only included products and replays safely", async () => {
  const service = createSalesService(c.db);
  const sale = await service.create(actor, input);
  expect(sale.totalAmount).toBe("21400.00");
  expect(sale.orders[0].lines.map((l) => l.lineKind)).toEqual([
    "combo",
    "combo_component",
    "combo_component",
  ]);
  expect(
    sale.orders[0].lines
      .slice(1)
      .every((l) => l.lineTotal === "0.00" && l.quantity === 2),
  ).toBe(true);
  expect(await c.db.select().from(saleLineFulfillments)).toHaveLength(2);
  expect((await service.create(actor, input)).id).toBe(sale.id);
  expect(await c.db.select().from(saleLines)).toHaveLength(3);
});
it("rejects stale or forged choices without partial records", async () => {
  const lines = input.lines as Record<string, unknown>[];
  for (const extra of [
    { expectedComboVersionId: crypto.randomUUID() },
    { comboChoices: [] },
    { expectedPrice: "1.00" },
  ])
    await expect(
      createSalesService(c.db).create(actor, {
        ...input,
        requestId: crypto.randomUUID(),
        lines: [{ ...lines[0], ...extra }],
      }),
    ).rejects.toBeDefined();
  expect(await c.db.select().from(saleLines)).toHaveLength(3);
  const children = await c.db
    .select()
    .from(saleLines)
    .where(eq(saleLines.lineKind, "combo_component"));
  expect(children).toHaveLength(2);
});
it("delivers only physical children once and rejects dispatching the commercial parent", async () => {
  const sale = await createSalesService(c.db).create(actor, input),
    order = sale.orders[0];
  const payload = {
    requestId: crypto.randomUUID(),
    orderId: order.id,
    lines: order.lines
      .slice(1)
      .map((l) => ({ saleLineId: l.id, quantity: l.quantity })),
  };
  const run = () =>
    executeCommand(
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
  await run();
  await run();
  const movements = await c.db
    .select()
    .from(stockMovements)
    .where(eq(stockMovements.action, "direct_dispatch"));
  expect(movements.map((m) => m.quantity)).toEqual(["-2.000000", "-2.000000"]);
  const invalid = {
    ...payload,
    requestId: crypto.randomUUID(),
    lines: [{ saleLineId: order.lines[0].id, quantity: 1 }],
  };
  await expect(
    executeCommand(
      c.db,
      actor,
      actor.branchId!,
      invalid,
      "deliver",
      invalid,
      (tx, ctx, operationId) =>
        deliverLines(tx, ctx, { ...invalid, operationId }),
    ),
  ).rejects.toBeDefined();
});
it("cancels unprepared combo reservations without consuming stock", async () => {
  const service = createSalesService(c.db),
    sale = await service.create(actor, {
      ...input,
      requestId: crypto.randomUUID(),
    });
  const before = await c.db.select().from(stockMovements);
  const cancelled = await service.cancel(actor, sale.id, {
    requestId: crypto.randomUUID(),
    revision: sale.revision,
    reason: "Cancelación de prueba",
    refundConfirmed: true,
  });
  expect(cancelled.status).toBe("cancelled");
  expect(await c.db.select().from(stockMovements)).toHaveLength(before.length);
});
it("rolls the entire combo back when its combined stock demand cannot be reserved", async () => {
  const before = await c.db.select().from(saleLines);
  await expect(
    createSalesService(c.db).create(actor, {
      ...input,
      requestId: crypto.randomUUID(),
      lines: [
        { ...(input.lines as Record<string, unknown>[])[0], quantity: 7 },
      ],
      payments: [
        {
          ...(input.payments as Record<string, unknown>[])[0],
          amount: "74900",
        },
      ],
    }),
  ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
  expect(await c.db.select().from(saleLines)).toHaveLength(before.length);
});
it("keeps individual product pricing and fulfillment unchanged", async () => {
  const [child] = await c.db
    .select()
    .from(saleLines)
    .where(eq(saleLines.lineKind, "combo_component"));
  const sale = await createSalesService(c.db).create(actor, {
    ...input,
    requestId: crypto.randomUUID(),
    lines: [
      {
        productId: child.productId,
        quantity: 1,
        price: "8000",
        expectedPrice: "8000.00",
        expectedFulfillmentVersionId: child.fulfillmentVersionId,
        modifiers: [],
      },
    ],
    payments: [
      { ...(input.payments as Record<string, unknown>[])[0], amount: "8000" },
    ],
  });
  expect(sale.totalAmount).toBe("8000.00");
  expect(sale.orders[0].lines).toHaveLength(1);
  expect(sale.orders[0].lines[0].lineKind).toBe("individual");
});
