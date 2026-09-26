import { randomUUID as uid } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDb } from "./helpers/database";
import {
  user,
  products,
  productPrices,
  paymentMethods,
  customers,
  inventoryMovements,
} from "@/db/schema";
import { createSalesService } from "@/modules/sales/service";
import { createTableService } from "@/modules/sales/tables";
import type { Actor } from "@/lib/access";

const admin: Actor = { id: "sales-admin", role: "admin" };
const staff: Actor = { id: "sales-staff", role: "staff" };
let ctx: Awaited<ReturnType<typeof createTestDb>>;
let sales: ReturnType<typeof createSalesService>;
let tables: ReturnType<typeof createTableService>;
let productId: string, methodId: string, customerId: string;
const queries: string[] = [];
beforeAll(async () => {
  ctx = await createTestDb({ logQuery: (query) => queries.push(query) });
  sales = createSalesService(ctx.db);
  tables = createTableService(ctx.db);
  for (const actor of [admin, staff])
    await ctx.db.insert(user).values({
      id: actor.id,
      name: actor.id,
      email: `${actor.id}@test.local`,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  [productId] = (
    await ctx.db.insert(products).values({ name: "Taro · prueba" }).returning()
  ).map((r) => r.id);
  await ctx.db.insert(productPrices).values([
    { productId, channel: "counter", amount: "7000" },
    { productId, channel: "pedidosya", amount: "7500" },
  ]);
  [methodId] = (
    await ctx.db
      .insert(paymentMethods)
      .values({ name: "Efectivo", kind: "cash" })
      .returning()
  ).map((r) => r.id);
  [customerId] = (
    await ctx.db
      .insert(customers)
      .values({ name: "Cliente prueba", marketingOptIn: true })
      .returning()
  ).map((r) => r.id);
});
afterAll(async () => {
  await ctx?.close();
});
const line = (
  price = "7000",
  expectedPrice: string | null = "7000.00",
  quantity = 1,
) => ({ productId, quantity, price, expectedPrice });
const payment = (amount = "7000") => ({ collector: "local", methodId, amount });
const counter = () => ({
  requestId: uid(),
  origin: "counter",
  channel: "counter",
  fulfillment: "takeaway",
  customerId,
  lines: [line()],
  payments: [payment()],
});
const tableInput = (x: number, y = 0) => ({
  requestId: uid(),
  name: `Mesa ${x}-${y}`,
  capacity: 4,
  x,
  y,
});

describe("sales ledger", () => {
  it("requires payment before confirming counter sales and rolls back failed writes", async () => {
    const input = counter();
    await expect(
      sales.create(staff, { ...input, payments: [] }),
    ).rejects.toMatchObject({ status: 400 });
    const sale = await sales.create(staff, input);
    expect(sale).toMatchObject({
      status: "closed",
      totalAmount: "7000.00",
      paidAmount: "7000.00",
      balanceDue: "0.00",
      customerName: "Cliente prueba",
    });
    expect(sale.orders).toHaveLength(1);
    expect(sale.orders[0].lines[0]).toMatchObject({
      name: "Taro · prueba",
      listPrice: "7000.00",
      unitPrice: "7000.00",
    });
    expect(await ctx.db.select().from(inventoryMovements)).toHaveLength(0);
  });
  it("locks replayed accounts before assembling a multi-query detail", async () => {
    const input = counter();
    await sales.create(admin, input);
    queries.length = 0;
    const replayed = await sales.create(admin, input);
    expect(replayed.paidAmount).toBe("7000.00");
    const firstSaleRead = queries.find(
      (q) => q.startsWith("select ") && q.includes('from "sales"'),
    );
    expect(firstSaleRead).toContain("for share");
  });
  it("retries with stable ids and refuses reuse for a different payload", async () => {
    const input = counter();
    const first = await sales.create(admin, input);
    expect((await sales.create(admin, input)).id).toBe(first.id);
    await expect(
      sales.create(admin, { ...input, notes: "Changed" }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(sales.create(staff, input)).rejects.toMatchObject({
      status: 409,
    });
  });
  it("aggregates table orders without duplicate visits and serializes partial payments", async () => {
    const table = await tables.save(admin, tableInput(0));
    const input = {
      ...counter(),
      origin: "table",
      fulfillment: "dine_in",
      tableId: table.id,
      payments: [],
    };
    let sale = await sales.create(staff, input);
    await expect(
      sales.create(staff, { ...input, requestId: uid() }),
    ).rejects.toMatchObject({ status: 409 });
    sale = await sales.addOrder(staff, sale.id, {
      requestId: uid(),
      revision: sale.revision,
      lines: [line()],
    });
    expect(sale.orders).toHaveLength(2);
    expect(sale.totalAmount).toBe("14000.00");
    const partial = {
      requestId: uid(),
      revision: sale.revision,
      payments: [payment("4000")],
    };
    sale = await sales.pay(staff, sale.id, partial);
    expect(sale.balanceDue).toBe("10000.00");
    expect(sale.status).toBe("open");
    await expect(
      sales.pay(staff, sale.id, { ...partial, requestId: uid() }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      sales.pay(staff, sale.id, {
        requestId: uid(),
        revision: sale.revision,
        payments: [payment("10001")],
      }),
    ).rejects.toMatchObject({ status: 400 });
    const last = {
      requestId: uid(),
      revision: sale.revision,
      payments: [payment("10000")],
    };
    sale = await sales.pay(staff, sale.id, last);
    expect(sale.status).toBe("closed");
    const retry = await sales.pay(staff, sale.id, last);
    expect(retry.payments).toHaveLength(2);
    expect(
      (await tables.list(staff)).find((r) => r.id === table.id)?.saleId,
    ).toBeNull();
    await expect(
      sales.addOrder(staff, sale.id, {
        requestId: uid(),
        revision: sale.revision,
        lines: [line()],
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("separates platform collection, prices and external duplication", async () => {
    const input = {
      ...counter(),
      origin: "delivery",
      channel: "pedidosya",
      fulfillment: "delivery",
      externalId: "  ABC-12  ",
      lines: [
        { ...line("7400", "7500.00"), priceReason: "Importe de la plataforma" },
      ],
      payments: [{ collector: "platform", amount: "7400" }],
    };
    const sale = await sales.create(staff, input);
    expect(sale).toMatchObject({
      totalAmount: "7400.00",
      localCollected: "0.00",
      platformCollected: "7400.00",
      externalId: "ABC-12",
    });
    await expect(
      sales.create(staff, { ...input, requestId: uid(), externalId: "abc-12" }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      sales.create(staff, {
        ...input,
        requestId: uid(),
        externalId: "new-id",
        lines: [line("7400", "7500.00")],
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      sales.create(staff, {
        ...counter(),
        payments: [{ collector: "platform", amount: "7000" }],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("rejects stale or absent prices without fallback and bounds exact totals", async () => {
    await expect(
      sales.create(admin, { ...counter(), lines: [line("7000", "6900.00")] }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      sales.create(staff, {
        ...counter(),
        lines: [{ ...line("6000"), priceReason: "Promo" }],
        payments: [payment("6000")],
      }),
    ).rejects.toMatchObject({ status: 403 });
    const input = {
      ...counter(),
      origin: "delivery",
      channel: "ubereats",
      fulfillment: "pickup",
      externalId: uid(),
      lines: [{ ...line("0", null), priceReason: "Cortesía confirmada" }],
      payments: [],
    };
    const sale = await sales.create(staff, input);
    expect(sale.totalAmount).toBe("0.00");
    expect(sale.orders[0].lines[0].listPrice).toBeNull();
    await expect(
      sales.create(admin, {
        ...counter(),
        lines: [{ ...line("999999999999", "7000.00", 999), priceReason: "x" }],
        payments: [],
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      sales.create(admin, { ...counter(), lines: [line("10,001")] }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("preserves historical values after catalog edits, including retry", async () => {
    const input = counter(),
      first = await sales.create(admin, input);
    await ctx.db
      .update(products)
      .set({ name: "Renombrado" })
      .where(eq(products.id, productId));
    const retry = await sales.create(admin, input);
    expect(retry.orders[0].lines[0].name).toBe("Taro · prueba");
    expect(
      (await sales.get(admin, first.id)).orders[0].lines[0].unitPrice,
    ).toBe("7000.00");
    await ctx.db
      .update(products)
      .set({ name: "Taro · prueba" })
      .where(eq(products.id, productId));
  });
  it("records explicit refund reversal on cancellation and never deletes the collection", async () => {
    const sale = await sales.create(admin, counter());
    const input = {
      requestId: uid(),
      revision: sale.revision,
      reason: "Duplicada",
      refundConfirmed: true,
    };
    await expect(sales.cancel(staff, sale.id, input)).rejects.toMatchObject({
      status: 403,
    });
    await expect(
      sales.cancel(admin, sale.id, { ...input, refundConfirmed: false }),
    ).rejects.toMatchObject({ status: 400 });
    const cancelled = await sales.cancel(admin, sale.id, input);
    expect(cancelled).toMatchObject({
      status: "cancelled",
      paidAmount: "0.00",
      localCollected: "0.00",
    });
    expect(cancelled.payments).toHaveLength(2);
    expect(
      cancelled.payments.find((p) => p.kind === "refund")?.originalPaymentId,
    ).toBe(sale.payments[0].id);
    expect((await sales.cancel(admin, sale.id, input)).payments).toHaveLength(
      2,
    );
    await expect(
      sales.pay(admin, sale.id, {
        requestId: uid(),
        revision: cancelled.revision,
        payments: [payment()],
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("supports exact split tender and optional external receipt reference", async () => {
    const sale = await sales.create(staff, {
      ...counter(),
      payments: [
        { ...payment("2000,01"), reference: "A-00042" },
        payment("4999,99"),
      ],
    });
    expect(sale.paidAmount).toBe("7000.00");
    expect(sale.payments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ amount: "2000.01", reference: "A-00042" }),
      ]),
    );
  });
  it("keeps lookups lean and enforces active records and valid channel combinations", async () => {
    const lookup = await sales.lookup(staff, "products", "Taro", "counter");
    expect(lookup.rows[0]).toMatchObject({
      id: productId,
      name: "Taro · prueba",
      price: "7000.00",
    });
    expect(JSON.stringify(lookup)).not.toMatch(/unitCost|marketingOptIn/);
    await expect(
      sales.create(staff, { ...counter(), channel: "pedidosya" }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(sales.create(null, counter())).rejects.toMatchObject({
      status: 401,
    });
    await ctx.db
      .update(paymentMethods)
      .set({ archivedAt: new Date() })
      .where(eq(paymentMethods.id, methodId));
    await expect(sales.create(admin, counter())).rejects.toMatchObject({
      status: 400,
    });
    await ctx.db
      .update(paymentMethods)
      .set({ archivedAt: null })
      .where(eq(paymentMethods.id, methodId));
  });
  it("prevents overlapping tables and archiving an occupied table", async () => {
    const table = await tables.save(admin, tableInput(1));
    await expect(tables.save(staff, tableInput(2))).rejects.toMatchObject({
      status: 403,
    });
    await expect(tables.save(admin, tableInput(1))).rejects.toMatchObject({
      status: 409,
    });
    const sale = await sales.create(staff, {
      ...counter(),
      origin: "table",
      fulfillment: "dine_in",
      tableId: table.id,
      payments: [],
    });
    await expect(
      tables.save(admin, {
        ...tableInput(1),
        id: table.id,
        revision: table.revision,
        archived: true,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await sales.cancel(admin, sale.id, {
      requestId: uid(),
      revision: sale.revision,
      reason: "Prueba",
      refundConfirmed: false,
    });
    const archived = await tables.save(admin, {
      ...tableInput(1),
      id: table.id,
      revision: table.revision,
      archived: true,
    });
    expect(archived.archived).toBe(true);
  });
  it("lists visits separately from orders and paginates", async () => {
    const result = await sales.list(staff, { origin: "table", offset: 0 });
    expect(result.total).toBe(2);
    expect(result.rows.length).toBe(2);
    const empty = await sales.list(staff, { offset: 1000 });
    expect(empty.rows).toHaveLength(0);
    const count = await ctx.db.execute(
      sql`select count(*)::int as count from sales`,
    );
    expect(Number(count.rows[0].count)).toBeGreaterThan(0);
  });
});
