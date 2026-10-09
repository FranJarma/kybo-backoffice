import { beforeAll, afterAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { user, operationalUsers } from "../src/db/auth-schema";
import { items, suppliers, paymentMethods } from "../src/db/business-schema";
import { inventoryValuations } from "../src/db/stock-schema";
import { createInventoryService } from "../src/modules/inventory/service";
import type { Actor } from "../src/lib/access";
let ctx: Awaited<ReturnType<typeof createDataModelTestContext>>;
let service: ReturnType<typeof createInventoryService>;
let vendor: string, carrier: string, method: string, itemIds: string[];
const actor: Actor = { id: "shipping-test", role: "admin" };
beforeAll(async () => {
  ctx = await createDataModelTestContext();
  actor.branchId = ctx.mapping.initialBranch.id;
  await ctx.db
    .insert(user)
    .values({ id: actor.id, name: "Test", email: "shipping@example.test" });
  await ctx.db
    .insert(operationalUsers)
    .values({ userId: actor.id, role: "admin" });
  const vendors = await ctx.db
    .insert(suppliers)
    .values([{ name: "Mercadería" }, { name: "Transporte" }])
    .returning();
  [vendor, carrier] = vendors.map((v) => v.id);
  const [m] = await ctx.db
    .insert(paymentMethods)
    .values({ name: "Efectivo", kind: "cash" })
    .returning();
  method = m.id;
  itemIds = (
    await ctx.db
      .insert(items)
      .values(
        ["TAP", "CUP"].map((code) => ({
          code,
          name: code,
          baseUnit: "unit",
          class: "food",
          purchasable: true,
          recipeUsable: true,
        })),
      )
      .returning()
  ).map((i) => i.id);
  service = createInventoryService(
    ctx.db,
    () => new Date("2026-10-09T15:00:00Z"),
  );
}, 60000);
afterAll(async () => {
  await ctx?.close();
});
function receipt(supplierId = carrier) {
  return {
    requestId: randomUUID(),
    supplierId: vendor,
    locationId: ctx.mapping.initialLocation.id,
    receivedOn: "2026-10-09",
    lines: itemIds.map((itemId, i) => ({
      itemId,
      quantity: "10",
      unitPrice: i ? "700" : "300",
    })),
    shipping: { amount: "1000", supplierId, allocation: "value" },
  };
}
it("separa precios, suma logística al stock y conserva deudas por acreedor", async () => {
  const payload = receipt();
  const result = await service.receive(actor, payload);
  expect(result.merchandiseAmount).toBe("10000.00");
  expect(result.landedAmount).toBe("11000.00");
  expect(result.totalAmount).toBe("10000.00");
  expect(result.shippingBalanceDue).toBe("1000.00");
  expect(result.lines.map((l) => l.shippingAmount)).toEqual([
    "300.00",
    "700.00",
  ]);
  expect(result.lines.map((l) => l.unitPrice)).toEqual([
    "300.000000",
    "700.000000",
  ]);
  const [value] = await ctx.db
    .select()
    .from(inventoryValuations)
    .where(eq(inventoryValuations.itemId, itemIds[0]));
  expect(value.value).toBe("3300.000000");
  expect((await service.receive(actor, payload)).id).toBe(result.id);
  const payment = {
    requestId: randomUUID(),
    paymentMethodId: method,
    paidOn: "2026-10-09",
    amount: "1000",
    target: "shipping",
  };
  const paid = await service.pay(actor, result.id, payment);
  expect(paid.shippingBalanceDue).toBe("0.00");
  expect(paid.balanceDue).toBe("10000.00");
  expect((await service.pay(actor, result.id, payment)).payments.length).toBe(
    1,
  );
  await expect(
    service.pay(actor, result.id, {
      ...payment,
      requestId: randomUUID(),
      amount: "0,01",
    }),
  ).rejects.toThrow("supera");
});
it("suma el envío al saldo del proveedor cuando lo cobra él", async () => {
  const result = await service.receive(actor, receipt(vendor));
  expect(result.balanceDue).toBe("11000.00");
  expect(result.shippingBalanceDue).toBe("0.00");
  const paid = await service.pay(actor, result.id, {
    requestId: randomUUID(),
    paymentMethodId: method,
    paidOn: "2026-10-09",
    amount: "11000",
  });
  expect(paid.balanceDue).toBe("0.00");
});
it("valida el reparto manual y permite asignar distinto del proporcional", async () => {
  const payload = receipt();
  await expect(
    service.receive(actor, {
      ...payload,
      shipping: {
        ...payload.shipping,
        allocation: "manual",
        amounts: ["500", "400"],
      },
    }),
  ).rejects.toThrow("coincidir");
  const result = await service.receive(actor, {
    ...payload,
    shipping: {
      ...payload.shipping,
      allocation: "manual",
      amounts: ["800", "200"],
    },
  });
  expect(result.lines.map((l) => l.shippingAmount)).toEqual([
    "800.00",
    "200.00",
  ]);
});
it("mantiene recepciones sin envío y costo pendiente", async () => {
  const payload = receipt();
  const result = await service.receive(actor, {
    ...payload,
    shipping: undefined,
    lines: [{ itemId: itemIds[0], quantity: "1" }],
  });
  expect(result.totalAmount).toBeNull();
  expect(result.shippingAmount).toBe("0.00");
  await expect(
    service.receive(actor, {
      ...payload,
      requestId: randomUUID(),
      lines: [{ itemId: itemIds[0], quantity: "1" }],
    }),
  ).rejects.toThrow("precios");
});
