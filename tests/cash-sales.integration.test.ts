import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID as uid } from "node:crypto";
import { eq } from "drizzle-orm";
import * as s from "@/db/schema";
import { cashMovements, cashSessions, cashSettings } from "@/db/cash-schema";
import type { Actor } from "@/lib/access";
import { createCatalogService } from "@/modules/catalog/service";
import { createSalesService } from "@/modules/sales/service";
import { getCashSnapshot } from "@/modules/cash/queries";
import { getProductConfiguration } from "@/modules/recipes/configuration";
import { createDataModelTestContext } from "./helpers/data-model-database";

let c: Awaited<ReturnType<typeof createDataModelTestContext>>;
const actor: Actor = { id: "cash-sales-admin", role: "admin" };
let service: ReturnType<typeof createSalesService>;
let productId: string,
  cashId: string,
  cardId: string,
  transferId: string,
  sessionId: string;
let fulfillmentVersionId: string;
const open = async (day: string) => {
  const [session] = await c.db
    .insert(cashSessions)
    .values({
      branchId: actor.branchId!,
      businessDate: day,
      openingCash: "100.00",
      closeTime: "23:00",
      timeZone: "UTC",
      openedBy: actor.id,
    })
    .returning();
  sessionId = session.id;
  await c.db.insert(cashMovements).values({
    branchId: actor.branchId!,
    sessionId,
    kind: "opening",
    amount: "100.00",
    methodKind: "cash",
    methodName: "Efectivo",
    concept: "Fondo inicial",
    sourceType: "cash-session",
    sourceId: sessionId,
    actorId: actor.id,
  });
  await c.db
    .insert(cashSettings)
    .values({ branchId: actor.branchId!, activatedAt: new Date() })
    .onConflictDoUpdate({
      target: cashSettings.branchId,
      set: { activatedAt: new Date() },
    });
  return session;
};
const close = async () => {
  await c.db
    .update(cashSessions)
    .set({
      state: "closed",
      closedAt: new Date(),
      closedBy: actor.id,
      expectedClosing: "100.00",
      counted: "100.00",
      withdrawal: "0.00",
      fund: "100.00",
      difference: "0.00",
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
    .where(eq(cashSessions.id, sessionId));
};
const input = (
  payments: {
    collector: string;
    methodId?: string;
    amount: string;
    reference?: string;
  }[] = [{ collector: "local", methodId: cashId, amount: "100" }],
) => ({
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
  payments,
});
beforeAll(async () => {
  c = await createDataModelTestContext();
  actor.branchId = c.mapping.initialBranch.id;
  await c.db.insert(s.user).values({
    id: actor.id,
    name: "Cash sales",
    email: "cash-sales@test.local",
  });
  await c.db
    .insert(s.operationalUsers)
    .values({ userId: actor.id, role: "admin" });
  await c.db
    .update(s.items)
    .set({ stockTracked: true })
    .where(eq(s.items.id, c.itemId));
  const catalog = createCatalogService(c.db);
  const p = await catalog.createRecord(actor, "products", {
    name: "Cash tea",
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
  fulfillmentVersionId = (
    await getProductConfiguration(c.db, actor, p.id, "counter")
  ).fulfillmentVersionId!;
  for (const kind of ["cash", "card", "transfer"] as const) {
    const method = await catalog.createRecord(actor, "payment-methods", {
      name: kind,
      kind,
      commissionPercent: "0",
    });
    if (kind === "cash") cashId = method.id;
    if (kind === "card") cardId = method.id;
    if (kind === "transfer") transferId = method.id;
  }
  service = createSalesService(c.db);
}, 60000);
afterAll(async () => {
  await c?.close();
});

it("requires each new card receipt and preserves leading zeros on replay and refunds", async () => {
  const beforeSales = await c.db.select({ id: s.sales.id }).from(s.sales);
  await expect(
    service.create(
      actor,
      input([
        {
          collector: "local",
          methodId: cardId,
          amount: "100",
          reference: "   ",
        },
      ]),
    ),
  ).rejects.toMatchObject({
    code: "VALIDATION",
    message: expect.stringContaining("comprobante"),
  });
  expect(await c.db.select({ id: s.sales.id }).from(s.sales)).toHaveLength(
    beforeSales.length,
  );
  const sale = await service.create(actor, {
    ...input([]),
    origin: "delivery",
    channel: "pedidosya",
    fulfillment: "pickup",
    externalId: uid(),
  });
  await expect(
    service.pay(actor, sale.id, {
      requestId: uid(),
      revision: sale.revision,
      payments: [{ collector: "local", methodId: cardId, amount: "100" }],
    }),
  ).rejects.toMatchObject({
    code: "VALIDATION",
    message: expect.stringContaining("comprobante"),
  });
  expect(
    await c.db
      .select()
      .from(s.salePayments)
      .where(eq(s.salePayments.saleId, sale.id)),
  ).toHaveLength(0);
  const command = {
    requestId: uid(),
    revision: sale.revision,
    payments: [
      {
        collector: "local",
        methodId: cardId,
        amount: "100",
        reference: " 0000123 ",
      },
    ],
  };
  const paid = await service.pay(actor, sale.id, command);
  await service.pay(actor, sale.id, command);
  expect(paid.payments).toHaveLength(1);
  expect(paid.payments[0]).toMatchObject({
    reference: "0000123",
    methodKind: "card",
  });
  expect(
    await c.db
      .select()
      .from(s.salePayments)
      .where(eq(s.salePayments.saleId, sale.id)),
  ).toHaveLength(1);
  const refund = await service.cancel(actor, sale.id, {
    requestId: uid(),
    revision: paid.revision,
    reason: "Prueba de devolución",
    refundConfirmed: true,
  });
  expect(
    refund.payments.find((payment) => payment.kind === "refund"),
  ).toMatchObject({
    reference: "0000123",
    originalPaymentId: paid.payments[0].id,
  });
});

it("leaves historical collections untouched until cash is activated", async () => {
  await service.create(actor, input());
  expect(await c.db.select().from(cashMovements)).toHaveLength(0);
});

it("records each split local payment by its source id once, keeping its method snapshot", async () => {
  await open("2026-10-26");
  const payload = input([
    { collector: "local", methodId: cashId, amount: "25,25" },
    { collector: "local", methodId: cardId, amount: "50", reference: "000050" },
    { collector: "local", methodId: transferId, amount: "24,75" },
  ]);
  const sale = await service.create(actor, payload);
  await service.create(actor, payload);
  const movements = await c.db
    .select()
    .from(cashMovements)
    .where(eq(cashMovements.sourceType, "sale-payment"));
  expect(movements).toHaveLength(3);
  expect(movements.map((row) => row.amount).sort()).toEqual([
    "24.75",
    "25.25",
    "50.00",
  ]);
  expect(movements.map((row) => row.sourceId).sort()).toEqual(
    sale.payments.map((row) => row.id).sort(),
  );
  expect(
    movements.every(
      (row) =>
        row.sourceType === "sale-payment" &&
        row.sessionId === sessionId &&
        row.kind === "collection",
    ),
  ).toBe(true);
  expect(movements.map((row) => row.methodKind).sort()).toEqual([
    "card",
    "cash",
    "transfer",
  ]);
  expect(movements.find((row) => row.methodKind === "card")?.reference).toBe(
    "000050",
  );
  const snapshot = await getCashSnapshot(c.db, actor);
  expect(
    snapshot.movements.find((row) => row.methodKind === "card"),
  ).toMatchObject({
    concept: `Cobro de venta #${sale.number}`,
    sessionId,
    branchId: actor.branchId,
    reference: "000050",
    amount: "50.00",
  });
  expect(snapshot.totals).toMatchObject({
    cardTotal: "50.00",
    cardOperations: 1,
  });
});

it("refunds a previous sale into the current open session without rewriting its old session", async () => {
  const sale = await service.create(actor, input());
  const oldSession = sessionId;
  await close();
  await open("2026-10-27");
  const payload = {
    requestId: uid(),
    revision: sale.revision,
    reason: "Devolución posterior",
    refundConfirmed: true,
  };
  const cancelled = await service.cancel(actor, sale.id, payload);
  await service.cancel(actor, sale.id, payload);
  const movements = await c.db
    .select()
    .from(cashMovements)
    .where(
      eq(
        cashMovements.sourceId,
        cancelled.payments.find((row) => row.kind === "refund")!.id,
      ),
    );
  expect(movements).toHaveLength(1);
  expect(movements[0]).toMatchObject({
    kind: "refund",
    amount: "-100.00",
    sessionId,
    methodKind: "cash",
  });
  const [previous] = await c.db
    .select()
    .from(cashSessions)
    .where(eq(cashSessions.id, oldSession));
  expect(previous).toMatchObject({
    state: "closed",
    expectedClosing: "100.00",
    difference: "0.00",
  });
});

it("records payments added to an open sale with stable collection identities", async () => {
  const sale = await service.create(actor, {
    ...input([]),
    origin: "delivery",
    channel: "pedidosya",
    fulfillment: "pickup",
    externalId: uid(),
  });
  const payload = {
    requestId: uid(),
    revision: sale.revision,
    payments: [
      { collector: "local", methodId: cashId, amount: "40" },
      {
        collector: "local",
        methodId: cardId,
        amount: "60",
        reference: "000060",
      },
    ],
  };
  const paid = await service.pay(actor, sale.id, payload);
  await service.pay(actor, sale.id, payload);
  const movements = await c.db.select().from(cashMovements);
  const saleMovements = movements.filter((row) =>
    paid.payments.some((payment) => payment.id === row.sourceId),
  );
  expect(saleMovements).toHaveLength(2);
  expect(saleMovements.map((row) => row.amount).sort()).toEqual([
    "40.00",
    "60.00",
  ]);
  expect(saleMovements.every((row) => row.sessionId === sessionId)).toBe(true);
});

it("rejects new local collections with cash closed, allows platform collection and idempotent replay", async () => {
  const payload = input();
  const collected = await service.create(actor, payload);
  const unpaid = await service.create(actor, {
    ...input([]),
    origin: "delivery",
    channel: "pedidosya",
    fulfillment: "pickup",
    externalId: uid(),
  });
  await close();
  await expect(service.create(actor, input())).rejects.toMatchObject({
    code: "CASH_CLOSED",
  });
  expect((await service.create(actor, payload)).id).toBe(collected.id);
  await expect(
    service.pay(actor, unpaid.id, {
      requestId: uid(),
      revision: unpaid.revision,
      payments: [{ collector: "local", methodId: cashId, amount: "100" }],
    }),
  ).rejects.toMatchObject({ code: "CASH_CLOSED" });
  const platform = await service.create(actor, {
    ...input([]),
    origin: "delivery",
    channel: "pedidosya",
    fulfillment: "delivery",
    externalId: uid(),
    payments: [{ collector: "platform", amount: "100" }],
  });
  expect(platform.platformCollected).toBe("100.00");
  expect(
    (await c.db.select().from(cashMovements)).some((row) =>
      platform.payments.some((p) => p.id === row.sourceId),
    ),
  ).toBe(false);
  await expect(
    service.cancel(actor, collected.id, {
      requestId: uid(),
      revision: collected.revision,
      reason: "No hay caja",
      refundConfirmed: true,
    }),
  ).rejects.toMatchObject({ code: "CASH_CLOSED" });
  await expect(
    service.cancel(actor, platform.id, {
      requestId: uid(),
      revision: platform.revision,
      reason: "Anulación de plataforma",
      refundConfirmed: true,
    }),
  ).resolves.toMatchObject({ status: "cancelled" });
  await c.db
    .update(s.operationalUsers)
    .set({ disabled: true })
    .where(eq(s.operationalUsers.userId, actor.id));
  await expect(service.create(actor, payload)).rejects.toMatchObject({
    status: 403,
  });
  await c.db
    .update(s.operationalUsers)
    .set({ disabled: false })
    .where(eq(s.operationalUsers.userId, actor.id));
});
