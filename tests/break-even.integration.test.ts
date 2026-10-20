import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import * as s from "@/db/schema";
import type { Actor } from "@/lib/access";
import { getBreakEven } from "@/modules/overheads/break-even-service";
import { publishCombo } from "@/modules/combos/service";
import { calculateBreakEven } from "@/modules/overheads/break-even";
let c: Awaited<ReturnType<typeof createDataModelTestContext>>;
const actor: Actor = { id: "equilibrium-admin", role: "admin" };
const staff: Actor = {
  id: "equilibrium-staff",
  role: "staff",
  catalogManager: true,
};
let direct: string,
  combo: string,
  otherBranch: string,
  versionId: string,
  groupId: string,
  optionId: string,
  fulfillmentId: string;
beforeAll(async () => {
  c = await createDataModelTestContext();
  actor.branchId = c.mapping.initialBranch.id;
  staff.branchId = actor.branchId;
  for (const a of [actor, staff]) {
    await c.db
      .insert(s.user)
      .values({ id: a.id, name: a.id, email: `${a.id}@test.local` });
    await c.db.insert(s.operationalUsers).values({
      userId: a.id,
      role: a.role,
      catalogManager: a.catalogManager ?? false,
    });
  }
  await c.db
    .insert(s.branchMemberships)
    .values({ userId: staff.id, branchId: actor.branchId!, role: "staff" });
  const [branch] = await c.db
    .insert(s.branches)
    .values({ code: "EQ-OTHER", name: "Otra", timeZone: "UTC" })
    .returning();
  otherBranch = branch.id;
  const [item] = await c.db
    .insert(s.items)
    .values({
      code: "EQ-DRINK",
      name: "Bebida",
      class: "beverage",
      baseUnit: "unit",
      unitCost: "40",
      purchasable: true,
      recipeUsable: false,
    })
    .returning();
  const [p] = await c.db
    .insert(s.products)
    .values({ name: "Bebida equilibrio", vatRate: "21" })
    .returning();
  direct = p.id;
  const [f] = await c.db
    .insert(s.productFulfillmentVersions)
    .values({
      productId: direct,
      version: 1,
      mode: "direct",
      itemId: item.id,
      quantity: "1",
    })
    .returning();
  fulfillmentId = f.id;
  await c.db
    .insert(s.productFulfillments)
    .values({ productId: direct, versionId: f.id });
  await c.db.insert(s.branchProducts).values([
    { branchId: actor.branchId!, productId: direct, enabled: true },
    { branchId: otherBranch, productId: direct, enabled: true },
  ]);
  await c.db.insert(s.inventoryValuations).values([
    {
      branchId: actor.branchId!,
      itemId: item.id,
      quantity: "10",
      value: "400",
    },
    { branchId: otherBranch, itemId: item.id, quantity: "10", value: "800" },
  ]);
  await c.db
    .insert(s.productPrices)
    .values({ productId: direct, channel: "counter", amount: "121" });
  await c.db
    .insert(s.paymentMethods)
    .values({ name: "Efectivo", kind: "cash", commissionPercent: "0" });
  await c.db.insert(s.expensePeriods).values({
    branchId: actor.branchId!,
    month: "2026-10-01",
    expectedUnits: 500,
    iibbRate: "2",
    entries: [
      {
        category: "rent",
        concept: "Alquiler",
        budget: "100000.00",
        actual: null,
        notes: "",
      },
    ],
    updatedBy: actor.id,
  });
  await c.db.insert(s.expensePeriods).values({
    branchId: otherBranch,
    month: "2026-10-01",
    expectedUnits: 500,
    iibbRate: "2",
    entries: [
      {
        category: "rent",
        concept: "Alquiler",
        budget: "100000.00",
        actual: null,
        notes: "",
      },
    ],
    updatedBy: actor.id,
  });
  const [cp] = await c.db
    .insert(s.products)
    .values({ name: "Combo doble", kind: "combo", vatRate: "21" })
    .returning();
  combo = cp.id;
  await publishCombo(c.db, actor, combo, {
    requestId: randomUUID(),
    revision: 0,
    groups: [
      { name: "Bebidas", quantity: 2, options: [{ productId: direct }] },
    ],
  });
  await c.db
    .insert(s.branchProducts)
    .values({ branchId: actor.branchId!, productId: combo, enabled: true });
  await c.db
    .insert(s.productPrices)
    .values({ productId: combo, channel: "counter", amount: "242" });
  const [version] = await c.db
    .select()
    .from(s.comboVersions)
    .where(eq(s.comboVersions.productId, combo));
  versionId = version.id;
  const [group] = await c.db
    .select()
    .from(s.comboGroups)
    .where(eq(s.comboGroups.versionId, version.id));
  groupId = group.id;
  const [option] = await c.db
    .select()
    .from(s.comboOptions)
    .where(eq(s.comboOptions.groupId, group.id));
  optionId = option.id;
}, 60000);
afterAll(async () => {
  await c?.close();
});
it("reuses catalog price, inventory cost, taxes and payment fees without subtracting fixed costs twice", async () => {
  const result = await getBreakEven(c.db, actor, "2026-10");
  expect(result.budget).toMatchObject({
    total: "100000.00",
    rate: "200.000000",
    expectedUnits: 500,
  });
  expect(result.historicalMix).toEqual([]);
  const estimate = result.products
    .find((p) => p.id === direct)!
    .estimates.find((e) => e.channel === "counter")!;
  expect(estimate).toMatchObject({
    price: "121.00",
    netPrice: "100.00",
    cost: "40.000000",
    vat: "21.00",
    iibb: "2.00",
    methods: [{ commission: "0.00", contribution: "58.00" }],
  });
  const comboRow = result.products.find((p) => p.id === combo)!;
  expect(comboRow.finalUnits).toBe(2);
  expect(comboRow.estimates[0].methods[0].contribution).toBe("116.00");
  const scenario = calculateBreakEven(result, {
    channel: "counter",
    methodId: result.methods[0].id,
    entries: [{ productId: combo, quantity: 1 }],
    expectedUnits: 500,
    daysOpen: null,
  });
  expect(scenario.products.find((p) => p.productId === combo)?.status).toBe(
    "ready",
  );
});
it("uses the selected branch and forbids staff even with catalog management", async () => {
  const result = await getBreakEven(
    c.db,
    { ...actor, branchId: otherBranch },
    "2026-10",
  );
  expect(result.products.map((p) => p.id)).toEqual([direct]);
  expect(result.products[0].estimates[0].cost).toBe("80.000000");
  await expect(getBreakEven(c.db, staff, "2026-10")).rejects.toMatchObject({
    status: 403,
  });
  await expect(getBreakEven(c.db, actor, "2026-13")).rejects.toThrow();
});
it("keeps absent expenses and unconfigured costs pending and reads beyond a ten-product costing batch", async () => {
  const extra = await c.db
    .insert(s.products)
    .values(Array.from({ length: 10 }, (_, i) => ({ name: `Pendiente ${i}` })))
    .returning();
  await c.db.insert(s.branchProducts).values(
    extra.map((p) => ({
      branchId: actor.branchId!,
      productId: p.id,
      enabled: true,
    })),
  );
  const result = await getBreakEven(c.db, actor, "2026-11");
  expect(result.products).toHaveLength(12);
  expect(result.budget.total).toBeNull();
  expect(
    result.products.find((p) => p.id === extra[0].id)?.estimates[0].cost,
  ).toBeNull();
  expect(
    result.products.find((p) => p.id === extra[0].id)?.pendingReasons.length,
  ).toBeGreaterThan(0);
});
async function sale(
  branchId: string,
  status: "closed" | "open" | "cancelled",
  day: string,
  quantity: number,
  isCombo = false,
) {
  const [sale] = await c.db
    .insert(s.sales)
    .values({
      branchId,
      status,
      businessDate: day,
      origin: "counter",
      channel: "counter",
      fulfillment: "takeaway",
      totalAmount: "0",
      actorId: actor.id,
    })
    .returning();
  const [order] = await c.db
    .insert(s.saleOrders)
    .values({
      branchId,
      saleId: sale.id,
      sequence: 1,
      totalAmount: "0",
      actorId: actor.id,
    })
    .returning();
  const [line] = await c.db
    .insert(s.saleLines)
    .values({
      branchId,
      orderId: order.id,
      position: 0,
      productId: isCombo ? combo : direct,
      name: "Prueba",
      quantity,
      unitPrice: "0",
      lineTotal: "0",
      ...(isCombo ? { lineKind: "combo", comboVersionId: versionId } : {}),
    })
    .returning();
  if (isCombo)
    await c.db.insert(s.saleLines).values({
      branchId,
      orderId: order.id,
      position: 1,
      productId: direct,
      name: "Componente",
      quantity: quantity * 2,
      unitPrice: "0",
      lineTotal: "0",
      lineKind: "combo_component",
      comboVersionId: versionId,
      parentLineId: line.id,
      comboGroupId: groupId,
      comboOptionId: optionId,
      fulfillmentVersionId: fulfillmentId,
    });
}
it("builds the observed mix from closed sales without doubling combos or mixing branches/months", async () => {
  await sale(actor.branchId!, "closed", "2026-10-10", 2);
  await sale(actor.branchId!, "closed", "2026-10-10", 3, true);
  await sale(actor.branchId!, "open", "2026-10-10", 50);
  await sale(actor.branchId!, "cancelled", "2026-10-10", 50);
  await sale(actor.branchId!, "closed", "2026-09-10", 50);
  await sale(otherBranch, "closed", "2026-10-10", 50);
  let result = await getBreakEven(c.db, actor, "2026-10");
  expect(result.historicalUnits).toBe(8);
  expect(result.historicalExcludedUnits).toBe(0);
  expect(result.historicalMix).toEqual(
    expect.arrayContaining([
      { productId: direct, quantity: 2 },
      { productId: combo, quantity: 3 },
    ]),
  );
  await c.db
    .update(s.branchProducts)
    .set({ enabled: false })
    .where(eq(s.branchProducts.productId, combo));
  result = await getBreakEven(c.db, actor, "2026-10");
  expect(result.historicalUnits).toBe(8);
  expect(result.historicalExcludedUnits).toBe(6);
  expect(result.historicalMix).toEqual([{ productId: direct, quantity: 2 }]);
});
