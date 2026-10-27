import { afterAll, beforeAll, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { items, inventoryLots } from "../src/db/schema";
import { lockStock } from "../src/modules/inventory/locking";
import { assertStockAvailable } from "../src/modules/inventory/stock-shortages";
let c: Awaited<ReturnType<typeof createDataModelTestContext>>;
let emptyId: string;
beforeAll(async () => {
  c = await createDataModelTestContext();
  const [item] = await c.db
    .insert(items)
    .values({
      code: "MILK",
      name: "Leche",
      class: "food",
      baseUnit: "ml",
      purchasable: true,
      recipeUsable: true,
    })
    .returning();
  emptyId = item.id;
});
afterAll(async () => {
  await c?.client.close();
});
async function check(demands: { itemId: string; quantity: string }[]) {
  return c.db.transaction(async (tx) => {
    const ctx = {
      actorId: "test",
      branchId: c.mapping.initialBranch.id,
      timeZone: "America/Argentina/Buenos_Aires",
      role: "admin" as const,
    };
    const input = demands.map((d) => ({
      ...d,
      locationId: c.mapping.initialLocation.id,
    }));
    const tracked = await lockStock(tx, ctx, input);
    await assertStockAvailable(tx, ctx, input, tracked);
  });
}
it("reports all missing items and aggregates shared demand across order lines", async () => {
  const error = await check([
    { itemId: c.itemId, quantity: "7" },
    { itemId: c.itemId, quantity: "7" },
    { itemId: emptyId, quantity: "0.125" },
  ]).catch((e: unknown) => e);
  expect(error).toMatchObject({ code: "INSUFFICIENT_STOCK", status: 409 });
  const message = (error as Error).message;
  expect(message).toContain(
    "Artículo histórico en Depósito: faltan 2 unid. (necesarios: 14; disponibles: 12)",
  );
  expect(message).toContain(
    "Leche en Depósito: faltan 0,125 ml (necesarios: 0,125; disponibles: 0)",
  );
  expect(message.match(/Artículo histórico/g)).toHaveLength(1);
});
it("accepts sufficient stock and ignores items without stock tracking", async () => {
  await c.db
    .update(items)
    .set({ stockTracked: false })
    .where(eq(items.id, emptyId));
  await expect(
    check([
      { itemId: c.itemId, quantity: "12" },
      { itemId: emptyId, quantity: "200" },
    ]),
  ).resolves.toBeUndefined();
});
it("excludes blocked lots from the displayed available quantity", async () => {
  await c.db
    .update(inventoryLots)
    .set({ blocked: true })
    .where(eq(inventoryLots.id, c.lotId));
  await expect(check([{ itemId: c.itemId, quantity: "1" }])).rejects.toThrow(
    "faltan 1 unid. (necesarios: 1; disponibles: 0)",
  );
});
