import { afterAll, beforeAll, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import type { AppDb } from "../src/db/client";
import { createPickupService } from "../src/modules/pickup/service";
import { randomUUID } from "node:crypto";
import * as s from "../src/db/schema";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { createSalesService } from "../src/modules/sales/service";
import type { Actor } from "../src/lib/access";

let c: Awaited<ReturnType<typeof createDataModelTestContext>>;
const actor: Actor = { id: "pos-fast-entry", role: "staff" };
let productId: string, versionId: string, methodId: string;
beforeAll(async () => {
  c = await createDataModelTestContext();
  actor.branchId = c.mapping.initialBranch.id;
  await c.db
    .insert(s.user)
    .values({ id: actor.id, name: "Caja", email: "pos-fast-entry@test.local" });
  await c.db
    .insert(s.operationalUsers)
    .values({ userId: actor.id, role: "staff" });
  await c.db
    .insert(s.branchMemberships)
    .values({ branchId: actor.branchId!, userId: actor.id, role: "staff" });
  await c.db
    .update(s.branches)
    .set({ locatorCount: 2 })
    .where(eq(s.branches.id, actor.branchId!));
  const [p] = await c.db
    .insert(s.products)
    .values({ name: "Bebida" })
    .returning();
  productId = p.id;
  await c.db.insert(s.branchProducts).values({
    branchId: actor.branchId!,
    productId,
    enabled: true,
    dispatchLocationId: c.mapping.initialLocation.id,
  });
  await c.db
    .insert(s.productPrices)
    .values({ productId, channel: "counter", amount: "100" });
  const [v] = await c.db
    .insert(s.productFulfillmentVersions)
    .values({
      productId,
      version: 1,
      mode: "direct",
      itemId: c.itemId,
      quantity: "1",
    })
    .returning();
  versionId = v.id;
  await c.db.insert(s.productFulfillments).values({ productId, versionId });
  const [m] = await c.db
    .insert(s.paymentMethods)
    .values({ name: "Efectivo", kind: "cash" })
    .returning();
  methodId = m.id;
});
afterAll(async () => {
  await c?.close();
});
function input() {
  return {
    requestId: randomUUID(),
    origin: "counter",
    channel: "counter",
    fulfillment: "takeaway",
    locatorMode: "automatic",
    lines: [
      {
        productId,
        quantity: 1,
        price: "100",
        expectedPrice: "100.00",
        expectedFulfillmentVersionId: versionId,
      },
    ],
    payments: [{ collector: "local", methodId, amount: "100" }],
  };
}
it("registers a new customer with optional email and automatically assigns the first free locator for staff", async () => {
  const command = {
    ...input(),
    newCustomer: { name: "  Martina  Pérez  ", email: "martina@test.local" },
  };
  const sale = await createSalesService(c.db).create(actor, command);
  expect(sale.customerName).toBe("Martina Pérez");
  expect(sale.customerId).toBeTruthy();
  expect(sale.orders[0].locatorNumber).toBe(1);
  expect(await c.db.select().from(s.customers)).toMatchObject([
    {
      id: sale.customerId,
      name: "Martina Pérez",
      email: "martina@test.local",
      marketingOptIn: false,
    },
  ]);
  expect(await createSalesService(c.db).create(actor, command)).toEqual(sale);
  expect(await c.db.select().from(s.customers)).toHaveLength(1);
  expect(await c.db.select().from(s.salePayments)).toHaveLength(1);
});
it("reuses an exact customer and never assigns an occupied locator", async () => {
  const sale = await createSalesService(c.db).create(actor, {
    ...input(),
    newCustomer: { name: "martina pérez", email: "MARTINA@test.local" },
  });
  expect(sale.orders[0].locatorNumber).toBe(2);
  expect(await c.db.select().from(s.customers)).toHaveLength(1);
  const noEquipment = await createSalesService(c.db).create(actor, input());
  expect(noEquipment.orders[0].locatorNumber).toBeNull();
  expect(await c.db.select().from(s.locatorAssignments)).toHaveLength(2);
});
it("saves a name without email and keeps homonyms with different emails separate", async () => {
  const first = await createSalesService(c.db).create(actor, {
    ...input(),
    newCustomer: { name: "Lucía" },
  });
  const other = await createSalesService(c.db).create(actor, {
    ...input(),
    newCustomer: { name: "Lucía", email: "otra-lucia@test.local" },
  });
  expect(first.customerId).not.toBe(other.customerId);
  expect(
    (
      await c.db
        .select()
        .from(s.customers)
        .where(eq(s.customers.id, first.customerId!))
    )[0].email,
  ).toBeNull();
});
it("rolls back the new customer when stock cannot be reserved", async () => {
  const before = await c.db.select().from(s.customers);
  const command = input();
  await expect(
    createSalesService(c.db).create(actor, {
      ...command,
      newCustomer: { name: "No debe quedar guardado" },
      lines: [{ ...command.lines[0], quantity: 99 }],
      payments: [{ collector: "local", methodId, amount: "9900" }],
    }),
  ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
  expect(await c.db.select().from(s.customers)).toEqual(before);
});
it("does not attach an email belonging to another customer to the typed name", async () => {
  await expect(
    createSalesService(c.db).create(actor, {
      ...input(),
      newCustomer: { name: "Otra persona", email: "martina@test.local" },
    }),
  ).rejects.toMatchObject({ status: 409 });
});

it("competing orders get distinct live equipment or none when the fleet is full", async () => {
  const [assignment] = await c.db
    .select()
    .from(s.locatorAssignments)
    .where(eq(s.locatorAssignments.number, 1));
  await c.db
    .update(s.locatorAssignments)
    .set({ returnedAt: new Date(), returnedBy: actor.id })
    .where(eq(s.locatorAssignments.id, assignment.id));
  const results = await Promise.all([
    createSalesService(c.db).create(actor, input()),
    createSalesService(c.db).create(actor, input()),
  ]);
  expect(results.map((sale) => sale.orders[0].locatorNumber).sort()).toEqual([
    1,
    null,
  ]);
  const held = await c.db
    .select()
    .from(s.locatorAssignments)
    .where(isNull(s.locatorAssignments.returnedAt));
  expect(held).toHaveLength(2);
  expect(new Set(held.map((a) => a.number)).size).toBe(2);
});

it("concurrent exact registrations reuse one customer and email lookup returns it", async () => {
  const commands = [input(), input()].map((command) => ({
    ...command,
    newCustomer: { name: "Nuevo único", email: "unico@test.local" },
  }));
  const results = await Promise.all(
    commands.map((command) => createSalesService(c.db).create(actor, command)),
  );
  expect(results[0].customerId).toBe(results[1].customerId);
  const lookup = await createSalesService(c.db).lookup(
    actor,
    "customers",
    "unico@test.local",
  );
  expect(lookup.rows).toMatchObject([
    {
      id: results[0].customerId,
      name: "Nuevo único",
      email: "unico@test.local",
    },
  ]);
});

it("takes the branch assignment lock before returning a held locator during replacement", async () => {
  await c.db
    .update(s.branches)
    .set({ locatorCount: 16 })
    .where(eq(s.branches.id, actor.branchId!));
  const sale = await createSalesService(c.db).create(actor, {
    ...input(),
    locatorMode: "manual",
    locatorNumber: 10,
  });
  const [assignment] = await c.db
    .select()
    .from(s.locatorAssignments)
    .where(
      and(
        eq(s.locatorAssignments.orderId, sale.orders[0].id),
        isNull(s.locatorAssignments.returnedAt),
      ),
    );
  const queries: string[] = [];
  const measured = drizzle({
    client: c.client,
    schema: s,
    logger: {
      logQuery(query) {
        queries.push(query);
      },
    },
  }) as unknown as AppDb;
  const history = await createPickupService(measured).change(
    actor,
    sale.orders[0].id,
    {
      requestId: randomUUID(),
      expectedAssignmentId: assignment.id,
      number: 11,
      returnConfirmed: true,
    },
  );
  expect(history.find((a) => a.number === 10)?.returnedAt).toBeTruthy();
  expect(history.find((a) => a.number === 11)?.returnedAt).toBeNull();
  const lock = queries.findIndex((q) => q.includes("pg_advisory_xact_lock"));
  const returned = queries.findIndex((q) =>
    q.startsWith('update "locator_assignments"'),
  );
  expect(lock).toBeGreaterThanOrEqual(0);
  expect(lock).toBeLessThan(returned);
});
