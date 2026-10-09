import { beforeAll, afterAll, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { inventoryValuations } from "../src/db/stock-schema";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { user, operationalUsers } from "../src/db/auth-schema";
import {
  items,
  suppliers,
  purchasePresentations,
} from "../src/db/business-schema";
import { adjustAt } from "../src/modules/inventory/scoped-adjustments";
import type { Actor } from "../src/lib/access";

let ctx: Awaited<ReturnType<typeof createDataModelTestContext>>;
let itemId: string, packId: string;
const actor: Actor = { id: "opening-test", role: "admin" };
beforeAll(async () => {
  ctx = await createDataModelTestContext();
  actor.branchId = ctx.mapping.initialBranch.id;
  await ctx.db
    .insert(user)
    .values({ id: actor.id, name: "Test", email: "opening@example.test" });
  await ctx.db
    .insert(operationalUsers)
    .values({ userId: actor.id, role: "admin" });
  const [item] = await ctx.db
    .insert(items)
    .values({
      name: "Leche",
      code: "MILK-OPEN",
      class: "food",
      baseUnit: "ml",
      purchasable: true,
      recipeUsable: true,
    })
    .returning();
  itemId = item.id;
  const [supplier] = await ctx.db
    .insert(suppliers)
    .values({ name: "Proveedor" })
    .returning();
  const [pack] = await ctx.db
    .insert(purchasePresentations)
    .values({
      name: "Caja de 12 litros",
      supplierId: supplier.id,
      itemId,
      baseQuantity: "12000.000000",
    })
    .returning();
  packId = pack.id;
}, 60000);
afterAll(async () => {
  await ctx?.close();
});
function input(extra: Record<string, unknown> = {}) {
  return {
    requestId: randomUUID(),
    kind: "opening",
    locationId: ctx.mapping.initialLocation.id,
    itemId,
    quantity: "2",
    unitCost: "1500",
    receivedOn: "2026-10-09",
    reason: "Stock inicial",
    ...extra,
  };
}
const now = new Date("2026-10-09T15:00:00Z");
it("ingresa litros y conserva el valor total; reintentar no duplica el lote", async () => {
  const payload = input({ entryUnit: "l" });
  const result = await adjustAt(ctx.db, actor, payload, now);
  expect(result.lot.initialQuantity).toBe("2000.000000");
  expect((await adjustAt(ctx.db, actor, payload, now)).lot.id).toBe(
    result.lot.id,
  );
  const [value] = await ctx.db
    .select()
    .from(inventoryValuations)
    .where(eq(inventoryValuations.itemId, itemId));
  expect(value.quantity).toBe("2000.000000");
  expect(value.value).toBe("3000.000000");
});
it("ingresa cajas usando el factor y revisión de la presentación", async () => {
  const result = await adjustAt(
    ctx.db,
    actor,
    input({
      presentationId: packId,
      presentationRevision: 1,
      unitCost: "18000",
    }),
    now,
  );
  expect(result.lot.initialQuantity).toBe("24000.000000");
  const [value] = await ctx.db
    .select()
    .from(inventoryValuations)
    .where(eq(inventoryValuations.itemId, itemId));
  expect(value.value).toBe("39000.000000");
});
it("rechaza unidades incompatibles y presentaciones obsoletas", async () => {
  await expect(
    adjustAt(ctx.db, actor, input({ entryUnit: "kg" }), now),
  ).rejects.toThrow();
  await expect(
    adjustAt(
      ctx.db,
      actor,
      input({ presentationId: packId, presentationRevision: 2 }),
      now,
    ),
  ).rejects.toThrow();
});
it("mantiene ingresos existentes en unidad base con costo pendiente", async () => {
  const result = await adjustAt(ctx.db, actor, input({ unitCost: null }), now);
  expect(result.lot.initialQuantity).toBe("2.000000");
  const [value] = await ctx.db
    .select()
    .from(inventoryValuations)
    .where(eq(inventoryValuations.itemId, itemId));
  expect(value.value).toBeNull();
});
it("convierte kilos y rechaza presentaciones de otro artículo, archivadas o ambiguas", async () => {
  const [flour] = await ctx.db
    .insert(items)
    .values({
      name: "Harina",
      code: "FLOUR-OPEN",
      purchasable: true,
      recipeUsable: true,
      class: "food",
      baseUnit: "g",
    })
    .returning();
  const result = await adjustAt(
    ctx.db,
    actor,
    input({
      itemId: flour.id,
      entryUnit: "kg",
      quantity: "1,5",
      unitCost: "1200",
    }),
    now,
  );
  expect(result.lot.initialQuantity).toBe("1500.000000");
  const [value] = await ctx.db
    .select()
    .from(inventoryValuations)
    .where(eq(inventoryValuations.itemId, flour.id));
  expect(value.value).toBe("1800.000000");
  await expect(
    adjustAt(
      ctx.db,
      actor,
      input({
        itemId: flour.id,
        presentationId: packId,
        presentationRevision: 1,
      }),
      now,
    ),
  ).rejects.toThrow("presentación");
  await expect(
    adjustAt(
      ctx.db,
      actor,
      input({
        entryUnit: "l",
        presentationId: packId,
        presentationRevision: 1,
      }),
      now,
    ),
  ).rejects.toThrow("ambas");
  await ctx.db
    .update(purchasePresentations)
    .set({ archivedAt: now })
    .where(eq(purchasePresentations.id, packId));
  await expect(
    adjustAt(
      ctx.db,
      actor,
      input({ presentationId: packId, presentationRevision: 1 }),
      now,
    ),
  ).rejects.toThrow("presentación");
});
it("rechaza cantidades fuera de rango sin crear stock", async () => {
  await expect(
    adjustAt(
      ctx.db,
      actor,
      input({ entryUnit: "l", quantity: "999999999999" }),
      now,
    ),
  ).rejects.toThrow("rango");
});
