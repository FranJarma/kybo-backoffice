import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID as uid } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { user, operationalUsers } from "@/db/auth-schema";
import { items, suppliers } from "@/db/business-schema";
import { branchMemberships, branches } from "@/db/branch-schema";
import { dailyOperationTasks as tasks } from "@/db/daily-operation-schema";
import { stockMovements } from "@/db/stock-movement-schema";
import { purchaseOrders, purchaseOrderLines } from "@/db/procurement-schema";
import { purchasePayments } from "@/db/inventory-schema";
import {
  createPurchaseDraft,
  commandPurchaseOrder,
} from "@/modules/procurement/orders";
import { getOrderSnapshot } from "@/modules/procurement/queries";
import { createInventoryService } from "@/modules/inventory/service";
import { executeCommand } from "@/modules/operations/command";
import {
  saveSupplyPolicy,
  getSupplySnapshot,
} from "@/modules/supply-alerts/service";
import { reconcileDailyOperations } from "@/modules/daily-operations/reconcile";
import { businessDate } from "@/modules/operations/business-date";
import { requireOperationalContext } from "@/modules/branches/context";
import { syncPurchaseTask } from "@/modules/procurement/tasks";
import { createCatalogService } from "@/modules/catalog/service";
import { addDays } from "@/modules/supply-alerts/engine";
import type { Actor } from "@/lib/access";
let ctx: Awaited<ReturnType<typeof createDataModelTestContext>>;
const manager: Actor = { id: "orders-manager", role: "admin" },
  staff: Actor = { id: "orders-staff", role: "staff" };
let supplierId: string, itemId: string;
const today = businessDate(new Date(), "America/Argentina/Buenos_Aires");
beforeAll(async () => {
  ctx = await createDataModelTestContext();
  for (const a of [manager, staff]) {
    a.branchId = ctx.mapping.initialBranch.id;
    await ctx.db
      .insert(user)
      .values({ id: a.id, name: a.id, email: `${a.id}@test.local` });
    await ctx.db
      .insert(operationalUsers)
      .values({ userId: a.id, role: a.role });
  }
  await ctx.db
    .insert(branchMemberships)
    .values({ userId: staff.id, branchId: staff.branchId!, role: "staff" });
  [supplierId] = (
    await ctx.db
      .insert(suppliers)
      .values({ name: "Proveedor Bolivia" })
      .returning()
  ).map((r) => r.id);
  [itemId] = (
    await ctx.db
      .insert(items)
      .values({
        code: uid().toUpperCase(),
        name: "Vasos",
        class: "packaging",
        baseUnit: "unit",
        purchasable: true,
        recipeUsable: true,
      })
      .returning()
  ).map((r) => r.id);
}, 60000);
afterAll(async () => ctx?.close());
const input = (quantity = "100") => ({
  requestId: uid(),
  supplierId,
  orderedOn: today,
  expectedOn: addDays(today, 3),
  notes: "Pedido semanal",
  lines: [{ itemId, quantity }],
});
async function confirmed(
  quantity = "100",
  expectedOn: string | null = addDays(today, 3),
) {
  const draft = await createPurchaseDraft(ctx.db, manager, {
    ...input(quantity),
    expectedOn,
  });
  return (
    await commandPurchaseOrder(ctx.db, manager, draft.result.id, {
      requestId: uid(),
      expectedRevision: 1,
      action: "confirm",
    })
  ).result;
}
it("records a draft and explicit confirmation without stock or payments, replay safe", async () => {
  const body = input();
  const before = await ctx.db.select().from(stockMovements),
    payments = await ctx.db.select().from(purchasePayments);
  const draft = await createPurchaseDraft(ctx.db, manager, body);
  expect(draft.result.state).toBe("draft");
  expect((await createPurchaseDraft(ctx.db, manager, body)).replayed).toBe(
    true,
  );
  const command = { requestId: uid(), expectedRevision: 1, action: "confirm" };
  const order = await commandPurchaseOrder(
    ctx.db,
    manager,
    draft.result.id,
    command,
  );
  expect(order.result).toMatchObject({ state: "ordered", revision: 2 });
  expect(
    (await commandPurchaseOrder(ctx.db, manager, draft.result.id, command))
      .replayed,
  ).toBe(true);
  expect(await ctx.db.select().from(stockMovements)).toEqual(before);
  expect(await ctx.db.select().from(purchasePayments)).toEqual(payments);
  expect(
    await ctx.db
      .select()
      .from(tasks)
      .where(eq(tasks.documentId, order.result.id)),
  ).toMatchObject([{ documentRole: "receive", state: "pending" }]);
  await expect(
    commandPurchaseOrder(ctx.db, manager, order.result.id, {
      ...command,
      requestId: uid(),
    }),
  ).rejects.toMatchObject({ status: 409 });
});
it("protects staff, cross-branch references and replay after access is revoked", async () => {
  const body = input();
  await expect(createPurchaseDraft(ctx.db, staff, body)).rejects.toMatchObject({
    status: 403,
  });
  await expect(getOrderSnapshot(ctx.db, staff)).rejects.toMatchObject({
    status: 403,
  });
  const draft = await createPurchaseDraft(ctx.db, manager, body);
  const [other] = await ctx.db
    .insert(branches)
    .values({
      code: "ORDER-OTHER",
      name: "Otra",
      timeZone: "America/Argentina/Buenos_Aires",
    })
    .returning();
  await expect(
    commandPurchaseOrder(
      ctx.db,
      { ...manager, branchId: other.id },
      draft.result.id,
      { requestId: uid(), expectedRevision: 1, action: "confirm" },
    ),
  ).rejects.toMatchObject({ status: 404 });
  await ctx.db
    .update(operationalUsers)
    .set({ disabled: true })
    .where(eq(operationalUsers.userId, manager.id));
  await expect(
    createPurchaseDraft(ctx.db, manager, body),
  ).rejects.toMatchObject({ status: 403 });
  await ctx.db
    .update(operationalUsers)
    .set({ disabled: false })
    .where(eq(operationalUsers.userId, manager.id));
});
it("partial receipt and cancellation preserve what arrived and close reception task", async () => {
  const o = await confirmed();
  await createInventoryService(ctx.db).receive(manager, {
    requestId: uid(),
    purchaseOrderId: o.id,
    expectedOrderRevision: o.revision,
    supplierId,
    receivedOn: today,
    locationId: ctx.mapping.initialLocation.id,
    lines: [{ itemId, orderLineId: o.lines[0].id, quantity: "40" }],
  });
  const cancelled = (
    await commandPurchaseOrder(ctx.db, manager, o.id, {
      requestId: uid(),
      expectedRevision: 3,
      action: "cancel",
      reason: "El proveedor no puede completar",
    })
  ).result;
  expect(cancelled.lines[0]).toMatchObject({
    receivedQuantity: "40.000000",
    cancelledQuantity: "60.000000",
    pendingQuantity: "0.000000",
  });
  expect(
    await ctx.db.select().from(tasks).where(eq(tasks.documentId, o.id)),
  ).toMatchObject([{ state: "cancelled" }]);
});
it("updates ETA with a reason and rejects stale schedule changes", async () => {
  const o = await confirmed("100", null);
  const change = {
    requestId: uid(),
    expectedRevision: o.revision,
    action: "reschedule",
    expectedOn: addDays(today, 5),
    reason: "Fecha confirmada por proveedor",
  };
  expect(
    (await commandPurchaseOrder(ctx.db, manager, o.id, change)).result
      .expectedOn,
  ).toBe(change.expectedOn);
  await expect(
    commandPurchaseOrder(ctx.db, manager, o.id, {
      ...change,
      requestId: uid(),
    }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    commandPurchaseOrder(ctx.db, manager, o.id, {
      ...change,
      expectedRevision: 3,
      requestId: uid(),
      reason: "",
    }),
  ).rejects.toThrow();
});
it("projects only the remaining quantity, reconciles buying once and follows partial arrivals", async () => {
  const [i] = await ctx.db
    .insert(items)
    .values({
      code: uid().toUpperCase(),
      name: "Sorbetes",
      class: "packaging",
      baseUnit: "unit",
      purchasable: true,
      recipeUsable: true,
    })
    .returning();
  await createInventoryService(ctx.db).adjust(manager, {
    requestId: uid(),
    kind: "opening",
    locationId: ctx.mapping.initialLocation.id,
    itemId: i.id,
    quantity: "1000",
    receivedOn: today,
    reason: "Prueba",
  });
  await executeCommand(
    ctx.db,
    manager,
    manager.branchId!,
    { requestId: uid() },
    "supply-alert-policy",
    {},
    (tx, c, op) =>
      saveSupplyPolicy(tx, c, op, {
        itemId: i.id,
        dailyConsumption: "100",
        leadDays: 7,
        safetyDays: 3,
        targetDays: 17,
        enabled: true,
      }),
  );
  const read = async () =>
    (await getSupplySnapshot(ctx.db, manager)).alerts.find(
      (a) => a.itemId === i.id,
    )!;
  expect((await read()).suggestedQuantity).toBe("700.000000");
  const draft = (
    await createPurchaseDraft(ctx.db, manager, {
      ...input("1200"),
      lines: [{ itemId: i.id, quantity: "1200" }],
    })
  ).result;
  expect((await read()).incomingQuantity).toBe("0.000000");
  const o = (
    await commandPurchaseOrder(ctx.db, manager, draft.id, {
      requestId: uid(),
      expectedRevision: 1,
      action: "confirm",
    })
  ).result;
  expect(await read()).toMatchObject({
    availableQuantity: "1000.000000",
    incomingQuantity: "1200.000000",
    suggestedQuantity: "0.000000",
  });
  await createInventoryService(ctx.db).receive(manager, {
    requestId: uid(),
    purchaseOrderId: o.id,
    expectedOrderRevision: 2,
    supplierId,
    receivedOn: today,
    locationId: ctx.mapping.initialLocation.id,
    lines: [{ itemId: i.id, orderLineId: o.lines[0].id, quantity: "400" }],
  });
  expect(await read()).toMatchObject({
    availableQuantity: "1400.000000",
    incomingQuantity: "800.000000",
    suggestedQuantity: "0.000000",
  });
  await reconcileDailyOperations(ctx.db, manager, { requestId: uid() });
  const active = (await ctx.db.select().from(tasks)).filter(
    (t) => !["done", "cancelled", "superseded"].includes(t.state),
  );
  expect(active.filter((t) => t.needKey === `supply:${i.id}`)).toHaveLength(0);
  expect(active.filter((t) => t.documentId === o.id)).toHaveLength(1);
});
it("serializes competing receipts and never receives more than the order", async () => {
  const o = await confirmed();
  const body = {
    purchaseOrderId: o.id,
    expectedOrderRevision: o.revision,
    supplierId,
    receivedOn: today,
    locationId: ctx.mapping.initialLocation.id,
    lines: [{ itemId, orderLineId: o.lines[0].id, quantity: "60" }],
  };
  const results = await Promise.allSettled(
    [1, 2].map(() =>
      createInventoryService(ctx.db).receive(manager, {
        ...body,
        requestId: uid(),
      }),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const [line] = await ctx.db
    .select()
    .from(purchaseOrderLines)
    .where(eq(purchaseOrderLines.id, o.lines[0].id));
  expect(line.receivedQuantity).toBe("60.000000");
  expect(
    (
      await ctx.db
        .select()
        .from(purchaseOrders)
        .where(eq(purchaseOrders.id, o.id))
    )[0].revision,
  ).toBe(3);
});
it("keeps the employee's blocked reason when only time changes arrival urgency", async () => {
  const o = await confirmed();
  await ctx.db
    .update(tasks)
    .set({ state: "blocked", reason: "El proveedor no respondió" })
    .where(eq(tasks.documentId, o.id));
  const [row] = await ctx.db
    .select()
    .from(purchaseOrders)
    .where(eq(purchaseOrders.id, o.id));
  await ctx.db.transaction(async (tx) => {
    const context = await requireOperationalContext(
      tx,
      manager,
      manager.branchId!,
    );
    await syncPurchaseTask(
      tx,
      context,
      row,
      new Date(`${addDays(o.expectedOn!, 1)}T12:00:00Z`),
    );
  });
  expect(
    await ctx.db.select().from(tasks).where(eq(tasks.documentId, o.id)),
  ).toMatchObject([
    {
      state: "blocked",
      urgency: "critical",
      reason: "El proveedor no respondió",
    },
  ]);
});
it.each(
  [false, true].flatMap((confirmed) => [
    { change: { baseUnit: "ml" }, code: "UNIT_IN_USE", confirmed },
    {
      change: { stockTracked: false },
      code: "STOCK_TRACKING_IN_USE",
      confirmed,
    },
  ]),
)(
  "protects ordered item semantics before stock: $code, confirmed=$confirmed",
  async ({ change, code, confirmed }) => {
    const fields = {
      code: uid().toUpperCase(),
      name: "Insumo pedido sin presentación",
      class: "food",
      baseUnit: "g",
      purchasable: true,
      recipeUsable: true,
      stockTracked: true,
      unitCost: "",
    };
    const catalog = createCatalogService(ctx.db);
    const i = await catalog.createRecord(manager, "items", fields);
    const draft = await createPurchaseDraft(ctx.db, manager, {
      ...input("10"),
      lines: [{ itemId: i.id, quantity: "10" }],
    });
    if (confirmed)
      await commandPurchaseOrder(ctx.db, manager, draft.result.id, {
        requestId: uid(),
        expectedRevision: 1,
        action: "confirm",
      });
    await expect(
      catalog.updateRecord(manager, "items", i.id, {
        revision: 1,
        ...fields,
        ...change,
      }),
    ).rejects.toMatchObject({ status: 409, code });
  },
);
it("defensively checks item compatibility before confirming a draft", async () => {
  const [i] = await ctx.db
    .insert(items)
    .values({
      code: uid().toUpperCase(),
      name: "Insumo de prueba",
      class: "food",
      baseUnit: "g",
      purchasable: true,
      recipeUsable: true,
    })
    .returning();
  const draft = await createPurchaseDraft(ctx.db, manager, {
    ...input("10"),
    lines: [{ itemId: i.id, quantity: "10" }],
  });
  await ctx.db.update(items).set({ baseUnit: "ml" }).where(eq(items.id, i.id));
  await expect(
    commandPurchaseOrder(ctx.db, manager, draft.result.id, {
      requestId: uid(),
      expectedRevision: 1,
      action: "confirm",
    }),
  ).rejects.toMatchObject({ status: 409 });
});
