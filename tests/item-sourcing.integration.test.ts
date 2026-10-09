import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { user, operationalUsers } from "../src/db/auth-schema";
import {
  items,
  suppliers,
  purchasePresentations,
} from "../src/db/business-schema";
import { createSourcingService } from "../src/modules/sourcing/service";
import {
  presentationQuantity,
  comparablePrice,
} from "../src/modules/sourcing/quantities";
import type { Actor } from "../src/lib/access";

let ctx: Awaited<ReturnType<typeof createDataModelTestContext>>;
const actor: Actor = { id: "sourcing-admin", role: "admin" };
let itemId: string, supplierA: string, supplierB: string;
beforeAll(async () => {
  ctx = await createDataModelTestContext();
  await ctx.client.exec(
    await readFile("drizzle/0011_item_sourcing.sql", "utf8"),
  );
  await ctx.db
    .insert(user)
    .values({ id: actor.id, name: "Prueba", email: "sourcing@example.test" });
  await ctx.db
    .insert(operationalUsers)
    .values({ userId: actor.id, role: "admin" });
  [itemId] = (
    await ctx.db
      .insert(items)
      .values({
        code: "MILK-SOURCE",
        name: "Leche",
        class: "beverage",
        baseUnit: "ml",
        unitCost: "2.000000",
        purchasable: true,
        recipeUsable: true,
      })
      .returning()
  ).map((r) => r.id);
  [supplierA, supplierB] = (
    await ctx.db
      .insert(suppliers)
      .values([{ name: "Proveedor A" }, { name: "Proveedor B" }])
      .returning()
  ).map((r) => r.id);
}, 60000);
afterAll(async () => {
  await ctx?.close();
});
const quote = (presentationId: string, price = "18000") => ({
  action: "quote",
  requestId: randomUUID(),
  presentationId,
  revision: 1,
  price,
  quotedOn: "2026-10-09",
  validUntil: "2026-10-31",
  leadTimeDays: 2,
  minimumPacks: 1,
});

describe("proveedores de un ingrediente", () => {
  it("convierte cajas y compara presentaciones por litro", () => {
    expect(presentationQuantity("12", "1", "l")).toBe("12000.000000");
    expect(comparablePrice("18000.000000", "12000.000000", "ml")).toEqual({
      amount: "1500.000000",
      unit: "l",
    });
    expect(() => presentationQuantity("0", "1", "l")).toThrow();
  });
  it("vincula varios proveedores sin exigir presentación ni precio y sin duplicar", async () => {
    const service = createSourcingService(ctx.db);
    const input = {
      action: "link",
      requestId: randomUUID(),
      supplierId: supplierA,
    };
    expect(await service.write(actor, itemId, input)).toEqual(
      await service.write(actor, itemId, input),
    );
    await service.write(actor, itemId, {
      ...input,
      requestId: randomUUID(),
      supplierId: supplierB,
    });
    const data = await service.list(actor, itemId);
    expect(data.suppliers).toHaveLength(2);
    expect(data.presentations).toHaveLength(0);
  });
  it("conserva historial, compara cotizaciones y no cambia el costo del ingrediente", async () => {
    const service = createSourcingService(ctx.db);
    const pack = {
      action: "presentation",
      requestId: randomUUID(),
      supplierId: supplierA,
      name: "Caja 12 x 1 l",
      unitsPerPack: "12",
      contentPerUnit: "1",
      unit: "l",
    };
    const created = await service.write(actor, itemId, pack);
    expect(await service.write(actor, itemId, pack)).toEqual(created);
    const input = quote(created.id);
    await service.write(actor, itemId, input);
    await service.write(actor, itemId, input);
    await service.write(actor, itemId, {
      ...input,
      requestId: randomUUID(),
      price: "19000",
      quotedOn: "2026-10-10",
    });
    const data = await service.list(actor, itemId);
    expect(data.history).toHaveLength(2);
    expect(data.presentations[0].quote?.price).toBe("19000.000000");
    expect(data.history.find((q) => q.price === "18000.000000")).toBeDefined();
    const [item] = await ctx.db
      .select()
      .from(items)
      .where(eq(items.id, itemId));
    expect(item.unitCost).toBe("2.000000");
    await expect(
      service.write(actor, itemId, { ...input, price: "20000" }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("incluye presentaciones preexistentes e invalida el precio si cambia el contenido", async () => {
    const service = createSourcingService(ctx.db);
    const [old] = await ctx.db
      .insert(purchasePresentations)
      .values({
        name: "Envase",
        itemId,
        supplierId: supplierB,
        baseQuantity: "1000.000000",
      })
      .returning();
    await service.write(actor, itemId, quote(old.id, "1500"));
    await ctx.db
      .update(purchasePresentations)
      .set({ baseQuantity: "2000.000000", revision: 2 })
      .where(eq(purchasePresentations.id, old.id));
    expect(
      (await service.list(actor, itemId)).presentations.find(
        (p) => p.id === old.id,
      )?.quote,
    ).toBeNull();
    expect(
      (await service.list(actor, itemId)).history.some(
        (q) => q.presentationId === old.id && q.baseQuantity === "1000.000000",
      ),
    ).toBe(true);
    await expect(
      service.write(actor, itemId, quote(old.id)),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("rechaza referencias ajenas, vigencias inválidas y cuentas sin permisos", async () => {
    const service = createSourcingService(ctx.db);
    const [foreign] = await ctx.db
      .insert(purchasePresentations)
      .values({
        name: "Otro ingrediente",
        itemId: ctx.itemId,
        supplierId: supplierA,
        baseQuantity: "1.000000",
      })
      .returning();
    await expect(
      service.write(actor, itemId, quote(foreign.id)),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.write(actor, itemId, {
        ...quote(foreign.id),
        validUntil: "2026-01-01",
      }),
    ).rejects.toBeDefined();
    await ctx.db
      .update(operationalUsers)
      .set({ disabled: true })
      .where(eq(operationalUsers.userId, actor.id));
    await expect(
      service.write(actor, itemId, {
        action: "link",
        requestId: randomUUID(),
        supplierId: supplierA,
      }),
    ).rejects.toMatchObject({ status: 403 });
    await ctx.db
      .update(operationalUsers)
      .set({ disabled: false })
      .where(eq(operationalUsers.userId, actor.id));
  });
  it("consulta proveedores de presentaciones antiguas aunque no tengan un vínculo nuevo", async () => {
    const [vendor] = await ctx.db
      .insert(suppliers)
      .values({ name: "Proveedor previo" })
      .returning();
    await ctx.db
      .insert(purchasePresentations)
      .values({
        name: "Envase previo",
        supplierId: vendor.id,
        itemId,
        baseQuantity: "1000.000000",
      });
    const data = await createSourcingService(ctx.db).list(actor, itemId);
    expect(data.suppliers.some((s) => s.id === vendor.id)).toBe(true);
  });
  it("conserva precios vencidos como historial sin reemplazar una cotización más reciente", async () => {
    const service = createSourcingService(ctx.db);
    const pack = (await service.list(actor, itemId)).presentations.find(
      (p) => p.name === "Caja 12 x 1 l",
    )!;
    await service.write(actor, itemId, {
      ...quote(pack.id, "10000"),
      quotedOn: "2026-01-01",
      validUntil: "2026-01-31",
    });
    const data = await service.list(actor, itemId);
    expect(data.presentations.find((p) => p.id === pack.id)?.quote?.price).toBe(
      "19000.000000",
    );
    expect(data.history.some((q) => q.validUntil === "2026-01-31")).toBe(true);
  });
});
