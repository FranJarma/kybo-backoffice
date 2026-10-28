import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID as uid } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { user, operationalUsers } from "@/db/auth-schema";
import { branches } from "@/db/branch-schema";
import { items, suppliers, paymentMethods } from "@/db/business-schema";
import { purchaseOrders, purchaseOrderLines } from "@/db/procurement-schema";
import { purchasePayments } from "@/db/inventory-schema";
import { createInventoryService } from "@/modules/inventory/service";
import { getOrderSnapshot } from "@/modules/procurement/queries";
import { parsePayment } from "@/modules/inventory/validation";
import { commandPurchaseOrder } from "@/modules/procurement/orders";
import { cashSettings, cashSessions, cashMovements } from "@/db/cash-schema";
import { requireOperationalContext } from "@/modules/branches/context";
import {
  applyPurchaseAdvances,
  recordPurchaseAdvance,
} from "@/modules/procurement/advances";
import type { PurchaseAdvanceInput } from "@/modules/procurement/types";
import type { Actor } from "@/lib/access";

let ctx: Awaited<ReturnType<typeof createDataModelTestContext>>;
const actor: Actor = { id: "advance-admin", role: "admin" };
let supplierId: string, itemId: string, transferId: string, cashId: string;
beforeAll(async () => {
  ctx = await createDataModelTestContext();
  actor.branchId = ctx.mapping.initialBranch.id;
  await ctx.db.insert(user).values({
    id: actor.id,
    name: "Administración",
    email: "advance@test.local",
  });
  await ctx.db
    .insert(operationalUsers)
    .values({ userId: actor.id, role: "admin" });
  [supplierId] = (
    await ctx.db
      .insert(suppliers)
      .values({ name: "Proveedor anticipado" })
      .returning()
  ).map((r) => r.id);
  [itemId] = (
    await ctx.db
      .insert(items)
      .values({
        code: uid().toUpperCase(),
        name: "Vasos anticipados",
        class: "packaging",
        baseUnit: "unit",
        purchasable: true,
        recipeUsable: true,
      })
      .returning()
  ).map((r) => r.id);
  [transferId, cashId] = (
    await ctx.db
      .insert(paymentMethods)
      .values([
        { name: "Transferencia anticipo", kind: "transfer" },
        { name: "Efectivo anticipo", kind: "cash" },
      ])
      .returning()
  ).map((r) => r.id);
}, 60000);
afterAll(async () => ctx?.close());

const inventory = () =>
  createInventoryService(ctx.db, () => new Date("2026-10-27T12:00:00Z"));
async function order(branchId = actor.branchId!) {
  const [o] = await ctx.db
    .insert(purchaseOrders)
    .values({
      branchId,
      supplierId,
      supplierName: "Proveedor anticipado",
      state: "ordered",
      orderedOn: "2026-10-20",
      actorId: actor.id,
    })
    .returning();
  const [line] = await ctx.db
    .insert(purchaseOrderLines)
    .values({
      orderId: o.id,
      position: 0,
      itemId,
      itemName: "Vasos",
      baseUnit: "unit",
      conversionFactor: "1",
      quantity: "100",
      orderedQuantity: "100",
    })
    .returning();
  return { o, line };
}
const advanceInput = (amount = "100000"): PurchaseAdvanceInput => ({
  requestId: uid(),
  supplierId,
  expectedRevision: 1,
  paymentMethodId: transferId,
  paidOn: "2026-10-23",
  amount,
  source: "external" as const,
  reference: "TR-100",
});
async function advance(orderId: string, input = advanceInput(), a = actor) {
  return recordPurchaseAdvance(ctx.db, a, orderId, input);
}
function receipt(
  o: { id: string },
  line: { id: string },
  unitPrice: string | null = "1000",
  quantity = "60",
  revision = 1,
) {
  return {
    requestId: uid(),
    supplierId,
    locationId: ctx.mapping.initialLocation.id,
    receivedOn: "2026-10-27",
    purchaseOrderId: o.id,
    expectedOrderRevision: revision,
    lines: [{ itemId, orderLineId: line.id, quantity, unitPrice }],
  };
}
it("accepts an explicit external origin on a supplier receipt payment", () => {
  expect(() =>
    parsePayment({
      requestId: uid(),
      paymentMethodId: transferId,
      paidOn: "2026-10-23",
      amount: "100",
      source: "external",
    }),
  ).not.toThrow();
});
it("applies a $100,000 external advance to a $60,000 partial receipt and leaves $40,000 without another payment or drawer movement", async () => {
  const { o, line } = await order(),
    input = advanceInput();
  const first = await advance(o.id, input);
  expect((await advance(o.id, input)).replayed).toBe(true);
  expect(first.replayed).toBe(false);
  const body = receipt(o, line);
  const received = await inventory().receive(actor, body);
  expect(received).toMatchObject({
    totalAmount: "60000.00",
    paidAmount: "60000.00",
    balanceDue: "0.00",
    advanceAppliedAmount: "60000.00",
  });
  expect(received.payments).toHaveLength(0);
  expect((await inventory().receive(actor, body)).id).toBe(received.id);
  const financial = (await getOrderSnapshot(ctx.db, actor, o.id)).orders[0]
    .financial;
  expect(financial).toMatchObject({
    advancedAmount: "100000.00",
    appliedAmount: "60000.00",
    availableAmount: "40000.00",
  });
  expect(
    (
      await ctx.db.execute(
        sql`select * from cash_movements where source_type='purchase-advance'`,
      )
    ).rows,
  ).toHaveLength(0);
  expect(
    await ctx.db
      .select()
      .from(purchasePayments)
      .where(eq(purchasePayments.receiptId, received.id)),
  ).toHaveLength(0);
});
it("keeps credit unapplied while the receipt cost is unknown", async () => {
  const { o, line } = await order();
  await advance(o.id);
  const received = await inventory().receive(actor, receipt(o, line, null));
  expect(received).toMatchObject({
    totalAmount: null,
    paidAmount: "0.00",
    advanceAppliedAmount: "0.00",
  });
  expect(
    (await getOrderSnapshot(ctx.db, actor, o.id)).orders[0].financial,
  ).toMatchObject({ availableAmount: "100000.00", appliedAmount: "0.00" });
});
it("rejects another supplier and branch, and rechecks effective staff access on replay", async () => {
  const { o } = await order(),
    input = advanceInput();
  const [other] = await ctx.db
    .insert(suppliers)
    .values({ name: "Otro proveedor" })
    .returning();
  await expect(
    advance(o.id, { ...input, supplierId: other.id }),
  ).rejects.toMatchObject({ status: 409 });
  const [branch] = await ctx.db
    .insert(branches)
    .values({
      code: uid().slice(0, 8).toUpperCase(),
      name: "Otra sucursal",
      timeZone: "UTC",
    })
    .returning();
  await expect(
    advance(o.id, input, { ...actor, branchId: branch.id }),
  ).rejects.toMatchObject({ status: 404 });
  await advance(o.id, input);
  await ctx.db
    .update(operationalUsers)
    .set({ role: "staff" })
    .where(eq(operationalUsers.userId, actor.id));
  await expect(advance(o.id, input)).rejects.toMatchObject({ status: 403 });
  await ctx.db
    .update(operationalUsers)
    .set({ role: "admin" })
    .where(eq(operationalUsers.userId, actor.id));
});
it("does not spend supplier credit on a different carrier and caps the second receipt at remaining credit", async () => {
  const { o, line } = await order();
  await advance(o.id);
  const [carrier] = await ctx.db
    .insert(suppliers)
    .values({ name: "Transportista" })
    .returning();
  const first = await inventory().receive(actor, {
    ...receipt(o, line),
    shipping: { amount: "10000", supplierId: carrier.id, allocation: "value" },
  });
  expect(first).toMatchObject({
    paidAmount: "60000.00",
    shippingPaidAmount: "0.00",
    shippingBalanceDue: "10000.00",
  });
  const second = await inventory().receive(
    actor,
    receipt(o, line, "2000", "40", 2),
  );
  expect(second).toMatchObject({
    totalAmount: "80000.00",
    paidAmount: "40000.00",
    balanceDue: "40000.00",
  });
  expect(
    (await getOrderSnapshot(ctx.db, actor, o.id)).orders[0].financial,
  ).toMatchObject({ availableAmount: "0.00", appliedAmount: "100000.00" });
});
it("stores source for a direct receipt payment and prevents paying beyond the advance-covered balance", async () => {
  const { o, line } = await order();
  await advance(o.id, advanceInput("40000"));
  const received = await inventory().receive(actor, receipt(o, line));
  const body = {
    requestId: uid(),
    paymentMethodId: transferId,
    source: "external",
    amount: "20000",
    paidOn: "2026-10-27",
  };
  const paid = await inventory().pay(actor, received.id, body);
  expect(paid).toMatchObject({ paidAmount: "60000.00", balanceDue: "0.00" });
  expect(paid.payments).toMatchObject([
    { source: "external", amount: "20000.00" },
  ]);
  expect(
    (await inventory().pay(actor, received.id, body)).payments,
  ).toHaveLength(1);
  await expect(
    inventory().pay(actor, received.id, {
      ...body,
      requestId: uid(),
      amount: "1",
    }),
  ).rejects.toMatchObject({ status: 409 });
});
it("applies only the unpaid supplier balance and includes shipping charged by that same supplier", async () => {
  const { o, line } = await order();
  const received = await inventory().receive(actor, {
    ...receipt(o, line),
    shipping: { amount: "10000", supplierId, allocation: "value" },
  });
  await inventory().pay(actor, received.id, {
    requestId: uid(),
    paymentMethodId: transferId,
    source: "external",
    amount: "50000",
    paidOn: "2026-10-27",
  });
  await advance(o.id, { ...advanceInput(), expectedRevision: 2 });
  const apply = () =>
    ctx.db.transaction(async (tx) => {
      const context = await requireOperationalContext(
        tx,
        actor,
        actor.branchId!,
      );
      await applyPurchaseAdvances(tx, context, received.id, o.id);
    });
  await apply();
  await apply();
  expect(await inventory().getReceipt(actor, received.id)).toMatchObject({
    totalAmount: "70000.00",
    paidAmount: "70000.00",
    balanceDue: "0.00",
    advanceAppliedAmount: "20000.00",
    shippingPaidAmount: "0.00",
  });
  expect(
    (await getOrderSnapshot(ctx.db, actor, o.id)).orders[0].financial,
  ).toMatchObject({ appliedAmount: "20000.00", availableAmount: "80000.00" });
});
it("rejects declaring a transfer as drawer cash", async () => {
  const { o } = await order();
  await expect(
    advance(o.id, { ...advanceInput(), source: "cash" } as never),
  ).rejects.toMatchObject({ status: 400 });
});
it("rejects applying another order's credit even with the same supplier and branch", async () => {
  const first = await order(),
    second = await order();
  await advance(first.o.id);
  const received = await inventory().receive(
    actor,
    receipt(second.o, second.line),
  );
  await expect(
    ctx.db.transaction(async (tx) => {
      const context = await requireOperationalContext(
        tx,
        actor,
        actor.branchId!,
      );
      await applyPurchaseAdvances(tx, context, received.id, first.o.id);
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect((await inventory().getReceipt(actor, received.id)).paidAmount).toBe(
    "0.00",
  );
});
it("serializes concurrent receipts and retries without consuming an advance twice", async () => {
  const { o, line } = await order();
  await advance(o.id);
  const body = receipt(o, line);
  const results = await Promise.all([
    inventory().receive(actor, body),
    inventory().receive(actor, body),
  ]);
  expect(results[0].id).toBe(results[1].id);
  expect(
    (await getOrderSnapshot(ctx.db, actor, o.id)).orders[0].financial,
  ).toMatchObject({ appliedAmount: "60000.00", availableAmount: "40000.00" });
  const next = receipt(o, line, "2000", "40", 2);
  const attempts = await Promise.allSettled([
    inventory().receive(actor, next),
    inventory().receive(actor, { ...next, requestId: uid() }),
  ]);
  expect(attempts.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(
    (await getOrderSnapshot(ctx.db, actor, o.id)).orders[0].financial,
  ).toMatchObject({ appliedAmount: "100000.00", availableAmount: "0.00" });
});
it("keeps an unapplied advance explicitly unresolved after cancellation without consuming it on a later receipt payment", async () => {
  const { o, line } = await order();
  const received = await inventory().receive(actor, receipt(o, line));
  await advance(o.id, { ...advanceInput(), expectedRevision: 2 });
  await commandPurchaseOrder(ctx.db, actor, o.id, {
    requestId: uid(),
    expectedRevision: 2,
    action: "cancel",
    reason: "No llegará el resto",
  });
  const paid = await inventory().pay(actor, received.id, {
    requestId: uid(),
    paymentMethodId: transferId,
    source: "external",
    amount: "60000",
    paidOn: "2026-10-27",
  });
  expect(paid).toMatchObject({
    paidAmount: "60000.00",
    advanceAppliedAmount: "0.00",
  });
  expect((await getOrderSnapshot(ctx.db, actor, o.id)).orders[0]).toMatchObject(
    {
      state: "cancelled",
      financial: {
        advancedAmount: "100000.00",
        appliedAmount: "0.00",
        availableAmount: "100000.00",
      },
    },
  );
});
it("records drawer payments once, applies cash advances without another egress, and permits external payments after cash closes", async () => {
  const [session] = await ctx.db
    .insert(cashSessions)
    .values({
      branchId: actor.branchId!,
      businessDate: "2026-10-27",
      openingCash: "1000000",
      closeTime: "23:00",
      timeZone: "UTC",
      openedBy: actor.id,
    })
    .returning();
  await ctx.db
    .insert(cashSettings)
    .values({ branchId: actor.branchId!, activatedAt: new Date() })
    .onConflictDoUpdate({
      target: cashSettings.branchId,
      set: { activatedAt: new Date() },
    });
  await ctx.db.insert(cashMovements).values({
    sessionId: session.id,
    branchId: actor.branchId!,
    kind: "opening",
    amount: "1000000.00",
    methodKind: "cash",
    methodName: "Efectivo",
    concept: "Apertura",
    sourceType: "cash-opening",
    sourceId: session.id,
    actorId: actor.id,
  });
  const first = await order(),
    second = await order();
  const firstReceipt = await inventory().receive(
    actor,
    receipt(first.o, first.line),
  );
  const payment = {
    requestId: uid(),
    paymentMethodId: cashId,
    amount: "10000",
    paidOn: "2026-10-27",
  };
  await inventory().pay(actor, firstReceipt.id, payment);
  const advanceBody = {
    ...advanceInput("5000"),
    source: "cash" as const,
    paymentMethodId: cashId,
  };
  const recorded = await advance(second.o.id, advanceBody as never);
  expect(
    (await inventory().receive(actor, receipt(second.o, second.line)))
      .paidAmount,
  ).toBe("5000.00");
  const movements = (
    await ctx.db
      .select()
      .from(cashMovements)
      .where(eq(cashMovements.sessionId, session.id))
  ).filter((m) => m.kind !== "opening");
  expect(movements).toHaveLength(2);
  expect(movements).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        kind: "supplier",
        amount: "-10000.00",
        sourceType: "purchase-payment",
      }),
      expect.objectContaining({
        kind: "advance",
        amount: "-5000.00",
        sourceType: "purchase-advance",
        sourceId: recorded.result.id,
      }),
    ]),
  );
  await ctx.db
    .update(cashSessions)
    .set({
      state: "closed",
      closedAt: new Date(),
      closedBy: actor.id,
      expectedClosing: "985000",
      counted: "985000",
      withdrawal: "0",
      fund: "985000",
      difference: "0",
      posnet: {
        mode: "none",
        lots: [],
        expected: "0.00",
        expectedOperations: 0,
        total: "0.00",
        operations: 0,
        difference: "0.00",
        needsReview: false,
      },
    })
    .where(eq(cashSessions.id, session.id));
  expect(
    (await inventory().pay(actor, firstReceipt.id, payment)).payments,
  ).toHaveLength(1);
  expect((await advance(second.o.id, advanceBody as never)).replayed).toBe(
    true,
  );
  await expect(
    inventory().pay(actor, firstReceipt.id, { ...payment, requestId: uid() }),
  ).rejects.toMatchObject({ code: "CASH_CLOSED" });
  await inventory().pay(actor, firstReceipt.id, {
    ...payment,
    requestId: uid(),
    source: "external",
    paymentMethodId: transferId,
  });
  const third = await order();
  await advance(third.o.id);
  expect(
    (
      await ctx.db
        .select()
        .from(cashMovements)
        .where(eq(cashMovements.sessionId, session.id))
    ).filter((m) => m.kind !== "opening"),
  ).toHaveLength(2);
});
it("keeps legacySchema receipt detail and payments working while advances explicitly require migration", async () => {
  const legacy = await createDataModelTestContext();
  try {
    await legacy.client.exec(
      "drop table purchase_advance_applications; drop table purchase_advances; alter table purchase_payments drop column source",
    );
    const legacyActor = { ...actor, branchId: legacy.mapping.initialBranch.id };
    await legacy.db.insert(user).values({
      id: legacyActor.id,
      name: "Administración",
      email: "legacy-purchases@test.local",
    });
    await legacy.db
      .insert(operationalUsers)
      .values({ userId: legacyActor.id, role: "admin" });
    const [supplier] = await legacy.db
      .insert(suppliers)
      .values({ name: "Proveedor sin migración" })
      .returning();
    const [item] = await legacy.db
      .insert(items)
      .values({
        code: "LEGACY-PURCHASE",
        name: "Vasos",
        class: "packaging",
        baseUnit: "unit",
        purchasable: true,
        recipeUsable: true,
      })
      .returning();
    const [method] = await legacy.db
      .insert(paymentMethods)
      .values({ name: "Transferencia", kind: "transfer" })
      .returning();
    const [o] = await legacy.db
      .insert(purchaseOrders)
      .values({
        branchId: legacyActor.branchId,
        supplierId: supplier.id,
        supplierName: supplier.name,
        state: "ordered",
        orderedOn: "2026-10-20",
        actorId: legacyActor.id,
      })
      .returning();
    const service = createInventoryService(
      legacy.db,
      () => new Date("2026-10-27T12:00:00Z"),
    );
    const received = await service.receive(legacyActor, {
      requestId: uid(),
      supplierId: supplier.id,
      locationId: legacy.mapping.initialLocation.id,
      receivedOn: "2026-10-27",
      lines: [{ itemId: item.id, quantity: "1", unitPrice: "1000" }],
    });
    expect(
      (await service.getReceipt(legacyActor, received.id)).balanceDue,
    ).toBe("1000.00");
    const paid = await service.pay(legacyActor, received.id, {
      requestId: uid(),
      paymentMethodId: method.id,
      source: "external",
      paidOn: "2026-10-27",
      amount: "1000",
    });
    expect(paid).toMatchObject({
      paidAmount: "1000.00",
      balanceDue: "0.00",
      payments: [{ source: null, amount: "1000.00" }],
    });
    expect(
      (await getOrderSnapshot(legacy.db, legacyActor, o.id)).orders[0]
        .financial,
    ).toBeUndefined();
    await expect(
      recordPurchaseAdvance(legacy.db, legacyActor, o.id, {
        ...advanceInput(),
        supplierId: supplier.id,
        paymentMethodId: method.id,
      }),
    ).rejects.toMatchObject({ code: "MIGRATION_REQUIRED", status: 409 });
  } finally {
    await legacy.close();
  }
}, 60000);
