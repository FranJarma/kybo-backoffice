import { afterAll, beforeAll, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { createCatalogService } from "../src/modules/catalog/service";
import { createSalesService } from "../src/modules/sales/service";
import { getProductConfiguration } from "../src/modules/recipes/configuration";
import { publishCombo } from "../src/modules/combos/service";
import * as s from "../src/db/schema";
import type { Actor } from "../src/lib/access";
let c: Awaited<ReturnType<typeof createDataModelTestContext>>;
const actor: Actor = { id: "vat-sales", role: "admin" };
let catalog: ReturnType<typeof createCatalogService>;
const prices = { priceCounter: "10000", pricePedidosYa: "", priceUberEats: "" };
beforeAll(async () => {
  c = await createDataModelTestContext();
  actor.branchId = c.mapping.initialBranch.id;
  catalog = createCatalogService(c.db);
  await c.db
    .insert(s.user)
    .values({ id: actor.id, name: "Test", email: "vat@test.local" });
  await c.db
    .insert(s.operationalUsers)
    .values({ userId: actor.id, role: "admin" });
});
afterAll(async () => {
  await c?.close();
});
const setup = () => ({
  mode: "direct",
  branchId: actor.branchId,
  dispatchLocationId: c.mapping.initialLocation.id,
  quantity: "1",
  source: { itemId: c.itemId },
});
it("charges a final price, snapshots VAT and each fee, and keeps history unchanged", async () => {
  const p = await catalog.createRecord(actor, "products", {
    name: "Tea",
    ...prices,
    vatRate: "21",
    setup: setup(),
  });
  const cash = await catalog.createRecord(actor, "payment-methods", {
    name: "Cash",
    kind: "cash",
    commissionPercent: "0",
  });
  const card = await catalog.createRecord(actor, "payment-methods", {
    name: "Card",
    kind: "card",
    commissionPercent: "3",
  });
  const config = await getProductConfiguration(c.db, actor, p.id, "counter");
  expect(config.basePrice).toBe("10000.00");
  const saleService = createSalesService(c.db);
  const input = {
    locatorNumber: 1,
    requestId: crypto.randomUUID(),
    origin: "counter",
    channel: "counter",
    fulfillment: "takeaway",
    lines: [
      {
        productId: p.id,
        quantity: 1,
        price: "10000",
        expectedPrice: "10000.00",
        expectedPricingRevision: config.pricingRevision,
        expectedFulfillmentVersionId: config.fulfillmentVersionId,
      },
    ],
    payments: [
      { collector: "local", methodId: cash.id, amount: "5000" },
      {
        collector: "local",
        methodId: card.id,
        amount: "5000",
        reference: "000321",
      },
    ],
  };
  const sale = await saleService.create(actor, input);
  expect(sale.totalAmount).toBe("10000.00");
  expect(sale.paidAmount).toBe("10000.00");
  expect(sale.orders[0].lines[0]).toMatchObject({
    vatRate: "21.00",
    netTotal: "8264.46",
    vatTotal: "1735.54",
  });
  expect(sale.payments.find((p) => p.methodName === "Cash")).toMatchObject({
    commissionPercent: "0.00",
    commissionAmount: "0.00",
    settlementNet: "5000.00",
  });
  expect(sale.payments.find((p) => p.methodName === "Card")).toMatchObject({
    commissionPercent: "3.00",
    commissionAmount: "150.00",
    settlementNet: "4850.00",
  });
  await catalog.updateRecord(actor, "products", p.id, {
    revision: p.revision,
    name: "Tea",
    ...prices,
    vatRate: "10,5",
  });
  await catalog.updateRecord(actor, "payment-methods", card.id, {
    revision: card.revision,
    name: "Card",
    kind: "card",
    commissionPercent: "8",
  });
  expect((await saleService.create(actor, input)).payments).toEqual(
    sale.payments,
  );
  expect(
    (await getProductConfiguration(c.db, actor, p.id, "counter")).basePrice,
  ).toBe("10000.00");
  await expect(
    saleService.create(actor, { ...input, requestId: crypto.randomUUID() }),
  ).rejects.toThrow(/precio|cambió|IVA/i);
  const [stored] = await c.db
    .select()
    .from(s.saleLines)
    .where(eq(s.saleLines.id, sale.orders[0].lines[0].id));
  expect(stored.vatRate).toBe("21.00");
  const cancelled = await saleService.cancel(actor, sale.id, {
    requestId: crypto.randomUUID(),
    revision: sale.revision,
    reason: "Prueba de devolución",
    refundConfirmed: true,
  });
  expect(
    cancelled.payments
      .filter((p) => p.kind === "refund")
      .every((p) => p.commissionAmount === null && p.settlementNet === null),
  ).toBe(true);
  expect(
    cancelled.payments.find(
      (p) => p.methodName === "Card" && p.kind === "collection",
    )?.commissionPercent,
  ).toBe("3.00");
});
it("keeps unknown tax and fees distinct from explicit zero", async () => {
  const p = await catalog.createRecord(actor, "products", {
    name: "Pending",
    ...prices,
    vatRate: "",
    setup: setup(),
  });
  const unknown = await catalog.createRecord(actor, "payment-methods", {
    name: "Unknown",
    kind: "other",
    commissionPercent: "",
  });
  expect(unknown.commissionPercent).toBeNull();
  expect(
    (await getProductConfiguration(c.db, actor, p.id, "counter")).basePrice,
  ).toBeNull();
  const lookup = await createSalesService(c.db).lookup(
    actor,
    "products",
    "Pending",
  );
  expect(lookup.rows[0]).toMatchObject({ vatPending: true, price: null });
  const zero = await catalog.createRecord(actor, "products", {
    name: "Zero",
    ...prices,
    vatRate: "0",
    setup: setup(),
  });
  const config = await getProductConfiguration(c.db, actor, zero.id, "counter");
  const sale = await createSalesService(c.db).create(actor, {
    locatorNumber: 2,
    requestId: crypto.randomUUID(),
    origin: "counter",
    channel: "counter",
    fulfillment: "takeaway",
    lines: [
      {
        productId: zero.id,
        quantity: 1,
        price: "10000",
        expectedPrice: "10000.00",
        expectedFulfillmentVersionId: config.fulfillmentVersionId,
      },
    ],
    payments: [{ collector: "local", methodId: unknown.id, amount: "10000" }],
  });
  expect(sale.payments[0]).toMatchObject({
    commissionPercent: null,
    commissionAmount: null,
    settlementNet: null,
  });
  expect(sale.orders[0].lines[0]).toMatchObject({
    vatRate: "0.00",
    vatTotal: "0.00",
    netTotal: "10000.00",
  });
});
it("validates rates and never compounds the tax when editing", async () => {
  await expect(
    catalog.createRecord(actor, "products", {
      name: "Bad",
      ...prices,
      vatRate: "21,01",
    }),
  ).rejects.toThrow();
  await expect(
    catalog.createRecord(actor, "payment-methods", {
      name: "Bad",
      kind: "card",
      commissionPercent: "100,01",
    }),
  ).rejects.toThrow();
  const p = await catalog.createRecord(actor, "products", {
    name: "Edit",
    ...prices,
    vatRate: "21",
    setup: setup(),
  });
  const edited = await catalog.updateRecord(actor, "products", p.id, {
    revision: p.revision,
    name: "Edit",
    ...prices,
    vatRate: "21",
  });
  expect(edited.priceCounter).toBe("10000.00");
  expect(
    (await getProductConfiguration(c.db, actor, p.id, "counter")).basePrice,
  ).toBe("10000.00");
});
it("rejects stale tax revisions even when rounding leaves the same final price", async () => {
  const p = await catalog.createRecord(actor, "products", {
    name: "Tiny",
    ...prices,
    priceCounter: "0,01",
    vatRate: "21",
    setup: setup(),
  });
  const old = await getProductConfiguration(c.db, actor, p.id, "counter");
  await catalog.updateRecord(actor, "products", p.id, {
    revision: p.revision,
    name: "Tiny",
    ...prices,
    priceCounter: "0,01",
    vatRate: "10,5",
  });
  const current = await getProductConfiguration(c.db, actor, p.id, "counter");
  expect(current.basePrice).toBe(old.basePrice);
  await expect(
    createSalesService(c.db).create(actor, {
      requestId: crypto.randomUUID(),
      origin: "counter",
      channel: "counter",
      fulfillment: "takeaway",
      lines: [
        {
          productId: p.id,
          quantity: 1,
          price: "0,01",
          expectedPrice: "0.01",
          expectedPricingRevision: old.pricingRevision,
          expectedFulfillmentVersionId: old.fulfillmentVersionId,
        },
      ],
      payments: [],
    }),
  ).rejects.toThrow(/IVA|cambió/i);
});
it("sums final combo extras and extracts VAT without another surcharge", async () => {
  const child = await catalog.createRecord(actor, "products", {
    name: "Included",
    ...prices,
    vatRate: "10,5",
    setup: setup(),
  });
  const physical = await getProductConfiguration(
    c.db,
    actor,
    child.id,
    "counter",
  );
  const parent = await catalog.createRecord(actor, "products", {
    name: "Tiny combo",
    ...prices,
    priceCounter: "0,01",
    vatRate: "21",
    kind: "combo",
    setup: { mode: "combo", branchId: actor.branchId },
  });
  const definition = await publishCombo(c.db, actor, parent.id, {
    requestId: crypto.randomUUID(),
    revision: 0,
    groups: [
      {
        name: "Included",
        quantity: 2,
        options: [{ productId: child.id, counter: "0.01" }],
      },
    ],
  });
  const method = await catalog.createRecord(actor, "payment-methods", {
    name: "Combo cash",
    kind: "cash",
    commissionPercent: "0",
  });
  const sale = await createSalesService(c.db).create(actor, {
    locatorNumber: 3,
    requestId: crypto.randomUUID(),
    origin: "counter",
    channel: "counter",
    fulfillment: "takeaway",
    lines: [
      {
        productId: parent.id,
        quantity: 1,
        price: "0,03",
        expectedPrice: "0.03",
        expectedComboVersionId: definition.id,
        comboChoices: [
          {
            groupId: definition.groups[0].id,
            optionId: definition.groups[0].options[0].id,
            expectedFulfillmentVersionId: physical.fulfillmentVersionId,
            expectedRecipeVersionId: null,
            modifiers: [],
          },
        ],
      },
    ],
    payments: [{ collector: "local", methodId: method.id, amount: "0,03" }],
  });
  expect(sale.totalAmount).toBe("0.03");
  expect(sale.orders[0].lines[0]).toMatchObject({
    lineKind: "combo",
    netTotal: "0.02",
    vatTotal: "0.01",
    vatRate: "21.00",
  });
  expect(sale.orders[0].lines[1]).toMatchObject({
    lineKind: "combo_component",
    quantity: 2,
    lineTotal: "0.00",
    vatRate: null,
    netTotal: null,
    vatTotal: null,
  });
});
