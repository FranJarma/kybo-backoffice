import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID as uid } from "node:crypto";
import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import type { Actor } from "@/lib/access";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { createCatalogService } from "@/modules/catalog/service";
import { createSalesService } from "@/modules/sales/service";
import { seedPrintingRecipe } from "./helpers/printing";
import { lockPrintTicket } from "@/modules/printing/jobs";
import { publishCombo } from "@/modules/combos/service";
import {
  getPrintingSnapshot,
  runPrintingCommand,
} from "@/modules/printing/service";
let c: Awaited<ReturnType<typeof createDataModelTestContext>>,
  service: ReturnType<typeof createSalesService>,
  productId: string,
  fulfillmentVersionId: string,
  methodId: string;
const actor: Actor = { id: "print-sales-admin", role: "admin" };
beforeAll(async () => {
  c = await createDataModelTestContext();
  actor.branchId = c.mapping.initialBranch.id;
  await c.db.insert(s.user).values({
    id: actor.id,
    name: "Print test",
    email: "print-sale@test.local",
  });
  await c.db
    .insert(s.operationalUsers)
    .values({ userId: actor.id, role: "admin" });
  const p = await createCatalogService(c.db).createRecord(actor, "products", {
    name: "Gaseosa de prueba",
    priceCounter: "100",
    pricePedidosYa: "100",
    priceUberEats: "",
    vatRate: "0",
    setup: {
      mode: "direct",
      branchId: actor.branchId,
      dispatchLocationId: c.mapping.initialLocation.id,
      quantity: "1",
      source: { itemId: c.itemId },
    },
  });
  productId = p.id;
  const [version] = await c.db
    .select()
    .from(s.productFulfillments)
    .where(eq(s.productFulfillments.productId, productId));
  fulfillmentVersionId = version.versionId;
  const [method] = await c.db
    .insert(s.paymentMethods)
    .values({ name: "Efectivo test", kind: "cash", commissionPercent: "0" })
    .returning();
  methodId = method.id;
  const [station] = await c.db
    .insert(s.preparationStations)
    .values({
      branchId: actor.branchId,
      name: "Barra",
      consumptionLocationId: c.mapping.initialLocation.id,
    })
    .returning();
  await c.db
    .insert(s.preparationRoutes)
    .values({ branchId: actor.branchId, productId, stationId: station.id });
  await runPrintingCommand(c.db, actor, uid(), {
    action: "configure",
    revision: 0,
    printerName: "Hasar USB",
    enabled: true,
  });
  service = createSalesService(c.db);
});
afterAll(async () => c?.close());
function input() {
  return {
    requestId: uid(),
    origin: "counter",
    channel: "counter",
    fulfillment: "takeaway",
    locatorMode: "automatic",
    lines: [
      {
        productId,
        expectedFulfillmentVersionId: fulfillmentVersionId,
        quantity: 1,
        price: "100",
        expectedPrice: "100.00",
      },
    ],
    payments: [{ collector: "local", methodId, amount: "100" }],
  };
}
it("creates one original from authoritative order confirmation, even without a recipe", async () => {
  const payload = input(),
    sale = await service.create(actor, payload);
  await service.create(actor, payload);
  const state = await getPrintingSnapshot(c.db, actor, sale.id);
  expect(state.jobs).toHaveLength(1);
  expect(state.jobs[0]).toMatchObject({
    kind: "original",
    stationName: "Barra",
    state: "pending",
  });
  expect(state.jobs[0].document.lines.map((l) => l.text).join("\n")).toContain(
    "Gaseosa de prueba",
  );
});
it("prints each table comanda once and never duplicates it on later collection", async () => {
  const [table] = await c.db
    .insert(s.diningTables)
    .values({
      branchId: actor.branchId!,
      name: "Print table",
      capacity: 2,
      x: 0,
      y: 0,
    })
    .returning();
  const sale = await service.create(actor, {
    ...input(),
    origin: "table",
    fulfillment: "dine_in",
    tableId: table.id,
    payments: [],
  });
  const second = await service.addOrder(actor, sale.id, {
    requestId: uid(),
    revision: sale.revision,
    locatorMode: "automatic",
    lines: input().lines,
  });
  await service.pay(actor, sale.id, {
    requestId: uid(),
    revision: second.revision,
    payments: [{ collector: "local", methodId, amount: "200" }],
  });
  const state = await getPrintingSnapshot(c.db, actor, sale.id);
  expect(state.jobs).toHaveLength(2);
  expect(state.jobs.map((j) => j.sequence).sort()).toEqual([1, 2]);
});
it("invalidates pending originals within the sale cancellation transaction", async () => {
  const sale = await service.create(actor, input());
  await service.cancel(actor, sale.id, {
    requestId: uid(),
    revision: sale.revision,
    reason: "Prueba de anulación",
    refundConfirmed: true,
  });
  expect(
    (await getPrintingSnapshot(c.db, actor, sale.id)).jobs.map((j) => j.state),
  ).toEqual(["cancelled"]);
});
it("prints saved modifier fields and keeps the document independent of later catalog edits", async () => {
  const recipe = await seedPrintingRecipe(
    c.db,
    actor,
    c.itemId,
    c.mapping.initialLocation.id,
  );
  const sale = await service.create(actor, {
    ...input(),
    lines: [{ ...recipe.line, quantity: 2, notes: "Entregar bien frío" }],
    payments: [{ collector: "local", methodId, amount: "200" }],
    notes: "Todo junto",
  });
  const [job] = (await getPrintingSnapshot(c.db, actor, sale.id)).jobs;
  const original = job.document.lines.map((l) => l.text).join("\n");
  expect(original).toContain("Hielo: Sin hielo × 1");
  expect(original).toContain("Preparar sin hielo");
  expect(original).toContain("MODIFICADORES POR UNIDAD");
  await c.db
    .update(s.products)
    .set({ name: "Nombre nuevo" })
    .where(eq(s.products.id, recipe.product.id));
  await c.db
    .update(s.modifierOptions)
    .set({ name: "Opción nueva" })
    .where(eq(s.modifierOptions.id, recipe.option.id));
  expect(
    (await getPrintingSnapshot(c.db, actor, sale.id)).jobs[0].document,
  ).toEqual(job.document);
});
it("keeps a mixed station active while its packaged item still needs delivery", async () => {
  const recipe = await seedPrintingRecipe(
    c.db,
    actor,
    c.itemId,
    c.mapping.initialLocation.id,
  );
  const sale = await service.create(actor, {
    ...input(),
    lines: [...input().lines, recipe.line],
    payments: [{ collector: "local", methodId, amount: "200" }],
  });
  const [order] = await c.db
    .select()
    .from(s.saleOrders)
    .where(eq(s.saleOrders.saleId, sale.id));
  await c.db
    .update(s.preparationTasks)
    .set({
      status: "delivered",
      startedAt: new Date(),
      readyAt: new Date(),
      deliveredAt: new Date(),
      assigneeId: actor.id,
    })
    .where(eq(s.preparationTasks.orderId, order.id));
  const [recipeLine] = await c.db
    .select()
    .from(s.saleLines)
    .where(eq(s.saleLines.productId, recipe.product.id));
  await c.db
    .update(s.saleLineFulfillments)
    .set({ completed: 1, delivered: 1 })
    .where(eq(s.saleLineFulfillments.saleLineId, recipeLine.id));
  const [ticket] = await c.db
    .select()
    .from(s.printTickets)
    .where(eq(s.printTickets.orderId, order.id));
  expect(
    await c.db.transaction((tx) =>
      lockPrintTicket(tx, ticket.id, actor.branchId!),
    ),
  ).toMatchObject({ active: true });
});
it("prints a real two-station combo with saved modifiers and multiplied children exactly once", async () => {
  const drink = await seedPrintingRecipe(
    c.db,
    actor,
    c.itemId,
    c.mapping.initialLocation.id,
    "Tea combo",
    "Barra",
  );
  const food = await seedPrintingRecipe(
    c.db,
    actor,
    c.itemId,
    c.mapping.initialLocation.id,
    "Waffle combo",
    "Cocina",
  );
  const [combo] = await c.db
    .insert(s.products)
    .values({ name: "Combo merienda", kind: "combo" })
    .returning();
  await c.db
    .insert(s.branchProducts)
    .values({ branchId: actor.branchId!, productId: combo.id, enabled: true });
  await c.db
    .insert(s.productPrices)
    .values({ productId: combo.id, channel: "counter", amount: "200" });
  const options = [drink, food];
  const version = await publishCombo(c.db, actor, combo.id, {
    requestId: uid(),
    revision: 0,
    groups: options.map((r, i) => ({
      name: i ? "Comida" : "Bebida",
      quantity: 1,
      options: [{ productId: r.product.id, counter: "0" }],
    })),
  });
  const sale = await service.create(actor, {
    ...input(),
    lines: [
      {
        productId: combo.id,
        quantity: 2,
        price: "200",
        expectedPrice: "200.00",
        expectedComboVersionId: version.id,
        comboChoices: version.groups.map((g, i) => ({
          groupId: g.id,
          optionId: g.options[0].id,
          expectedFulfillmentVersionId:
            options[i].line.expectedFulfillmentVersionId,
          expectedRecipeVersionId: options[i].line.expectedRecipeVersionId,
          modifiers: options[i].line.modifiers,
        })),
      },
    ],
    payments: [{ collector: "local", methodId, amount: "400" }],
  });
  const state = await getPrintingSnapshot(c.db, actor, sale.id);
  expect(state.jobs).toHaveLength(2);
  for (const [i, station] of ["Barra", "Cocina"].entries()) {
    const text = state.jobs
      .find((j) => j.stationName === station)!
      .document.lines.map((l) => l.text)
      .join("\n");
    expect(text).toContain(`2 × ${options[i].product.name}`);
    expect(text).not.toContain("2 × Combo merienda");
    expect(text).toContain("Combo: Combo merienda");
    expect(text).toContain("Hielo: Sin hielo × 1");
  }
});
