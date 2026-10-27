import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID as uid } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { user, operationalUsers } from "@/db/auth-schema";
import { items, suppliers, purchasePresentations } from "@/db/business-schema";
import {
  purchaseOrders,
  purchaseOrderLines,
  purchaseOrderReceipts,
} from "@/db/procurement-schema";
import { stockMovements } from "@/db/stock-movement-schema";
import { createInventoryService } from "@/modules/inventory/service";
import type { Actor } from "@/lib/access";
let ctx: Awaited<ReturnType<typeof createDataModelTestContext>>;
const actor: Actor = { id: "procurement-owner", role: "admin" };
let supplierId: string, itemId: string;
beforeAll(async () => {
  ctx = await createDataModelTestContext();
  actor.branchId = ctx.mapping.initialBranch.id;
  await ctx.db.insert(user).values({
    id: actor.id,
    name: "Encargado",
    email: "procurement@test.local",
  });
  await ctx.db
    .insert(operationalUsers)
    .values({ userId: actor.id, role: "admin" });
  [supplierId] = (
    await ctx.db.insert(suppliers).values({ name: "Bolivia" }).returning()
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
async function order(factor = "1") {
  const [o] = await ctx.db
    .insert(purchaseOrders)
    .values({
      branchId: actor.branchId!,
      supplierId,
      supplierName: "Bolivia",
      state: "ordered",
      orderedOn: "2026-10-20",
      expectedOn: "2026-10-30",
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
      conversionFactor: factor,
      quantity: "100",
      orderedQuantity: String(Number(factor) * 100),
    })
    .returning();
  return { o, line };
}
function receive(
  o: { id: string },
  line: { id: string },
  quantity: string,
  revision = 1,
  requestId = uid(),
) {
  return {
    requestId,
    supplierId,
    locationId: ctx.mapping.initialLocation.id,
    receivedOn: "2026-10-23",
    purchaseOrderId: o.id,
    expectedOrderRevision: revision,
    lines: [{ itemId, orderLineId: line.id, quantity }],
  };
}
const inventory = () =>
  createInventoryService(ctx.db, () => new Date("2026-10-23T12:00:00Z"));
it("receives 40 of 100 atomically and keeps 60 pending; replay never receives twice", async () => {
  const { o, line } = await order();
  const body = receive(o, line, "40");
  const receipt = await inventory().receive(actor, body);
  expect((await inventory().receive(actor, body)).id).toBe(receipt.id);
  expect(
    await ctx.db
      .select()
      .from(purchaseOrderLines)
      .where(eq(purchaseOrderLines.id, line.id)),
  ).toMatchObject([{ receivedQuantity: "40.000000" }]);
  expect(
    await ctx.db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, o.id)),
  ).toMatchObject([{ state: "partially_received", revision: 2 }]);
  expect(
    await ctx.db
      .select()
      .from(purchaseOrderReceipts)
      .where(eq(purchaseOrderReceipts.orderId, o.id)),
  ).toHaveLength(1);
  await inventory().receive(actor, receive(o, line, "60", 2));
  expect(
    await ctx.db
      .select()
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, o.id)),
  ).toMatchObject([{ state: "received", revision: 3 }]);
});
it("rejects excess, stale revisions and a foreign line without any partial stock writes", async () => {
  const { o, line } = await order(),
    other = await order();
  const before = await ctx.db.select().from(stockMovements);
  for (const body of [
    receive(o, line, "101"),
    receive(o, line, "10", 2),
    receive(o, other.line, "10"),
  ])
    await expect(inventory().receive(actor, body)).rejects.toMatchObject({
      status: 409,
    });
  expect(await ctx.db.select().from(stockMovements)).toEqual(before);
});
it("receives with the original conversion even after the presentation changes", async () => {
  const { o, line } = await order("100");
  const [p] = await ctx.db
    .insert(purchasePresentations)
    .values({ name: "Caja", supplierId, itemId, baseQuantity: "500" })
    .returning();
  await ctx.db
    .update(purchaseOrderLines)
    .set({ presentationId: p.id, presentationName: "Caja 100" })
    .where(eq(purchaseOrderLines.id, line.id));
  const body = receive(o, line, "2");
  const receipt = await inventory().receive(actor, {
    ...body,
    lines: [{ ...body.lines[0], presentationId: p.id }],
  });
  expect(receipt.lines[0]).toMatchObject({
    conversionFactor: "100.000000",
    baseQuantity: "200.000000",
    presentationName: "Caja 100",
  });
});
it("rejects order references without an order header and rejects draft receipts", async () => {
  const { o, line } = await order();
  const body = receive(o, line, "1");
  await expect(
    inventory().receive(actor, {
      ...body,
      purchaseOrderId: undefined,
      expectedOrderRevision: undefined,
    }),
  ).rejects.toMatchObject({ status: 400 });
  await ctx.db
    .update(purchaseOrders)
    .set({ state: "draft" })
    .where(eq(purchaseOrders.id, o.id));
  await expect(inventory().receive(actor, body)).rejects.toMatchObject({
    status: 409,
  });
});
it("defensively rejects an incompatible item unit at receipt without moving stock", async () => {
  const { o, line } = await order();
  const before = await ctx.db.select().from(stockMovements);
  await ctx.db.update(items).set({ baseUnit: "g" }).where(eq(items.id, itemId));
  try {
    await expect(
      inventory().receive(actor, receive(o, line, "1")),
    ).rejects.toMatchObject({ status: 409 });
  } finally {
    await ctx.db
      .update(items)
      .set({ baseUnit: "unit" })
      .where(eq(items.id, itemId));
  }
  expect(await ctx.db.select().from(stockMovements)).toEqual(before);
});
