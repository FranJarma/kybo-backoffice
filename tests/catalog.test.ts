import { afterAll, beforeAll, describe, it, expect } from "vitest";
import { eq, sql } from "drizzle-orm";
import { createTestDb } from "./helpers/database";
import { createCatalogService } from "../src/modules/catalog/service";
import { user } from "../src/db/auth-schema";
import {
  auditEvents,
  items,
  suppliers,
  purchasePresentations,
} from "../src/db/business-schema";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let service: ReturnType<typeof createCatalogService>;
const admin = { id: "owner-domain-test", role: "admin" as const };
const supplierInput = {
  name: "Distribuidora",
  email: "",
  phone: "",
  notes: "",
};
beforeAll(async () => {
  ctx = await createTestDb();
  service = createCatalogService(ctx.db);
  await ctx.db.insert(user).values({
    id: admin.id,
    name: "Owner",
    email: "domain@example.test",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});
afterAll(async () => {
  await ctx?.close();
});

describe("authorized and durable master records", () => {
  it("rejects staff on reads and writes", async () => {
    const staff = { id: admin.id, role: "staff" as const };
    await expect(service.listRecords(staff, "customers")).rejects.toMatchObject(
      { status: 403 },
    );
    await expect(
      service.createRecord(staff, "customers", { name: "Ignored" }),
    ).rejects.toMatchObject({ status: 403 });
  });
  it("persists data and audit together and protects stale edits", async () => {
    const created = await service.createRecord(
      admin,
      "suppliers",
      supplierInput,
    );
    const changed = await service.updateRecord(admin, "suppliers", created.id, {
      ...supplierInput,
      name: "Distribuidora actualizada",
      revision: 1,
    });
    expect(changed.revision).toBe(2);
    await expect(
      service.updateRecord(admin, "suppliers", created.id, {
        ...supplierInput,
        name: "Obsoleto",
        revision: 1,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      (await service.listRecords(admin, "suppliers", "actualizada")).rows[0]
        .name,
    ).toBe("Distribuidora actualizada");
    const events = await ctx.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.recordId, created.id));
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.actorId === admin.id)).toBe(true);
  });
  it("archives without deleting and restores by revision", async () => {
    const created = await service.createRecord(admin, "suppliers", {
      ...supplierInput,
      name: "Temporal",
    });
    const archived = await service.updateRecord(
      admin,
      "suppliers",
      created.id,
      { revision: 1, archived: true },
    );
    expect(archived.archivedAt).not.toBeNull();
    expect(
      (await service.listRecords(admin, "suppliers", "Temporal")).total,
    ).toBe(0);
    expect(
      (await service.listRecords(admin, "suppliers", "Temporal", true)).total,
    ).toBe(1);
    expect(
      (
        await service.updateRecord(admin, "suppliers", created.id, {
          revision: 2,
          archived: false,
        })
      ).archivedAt,
    ).toBeNull();
  });
  it("creates clients without marketing consent or a phone", async () => {
    const row = await service.createRecord(admin, "customers", {
      name: "Ana",
      email: "",
      phone: "",
    });
    expect(row.phone).toBeNull();
    expect(row.marketingOptIn).toBe(false);
  });
  it("rolls back business write if audit insert fails", async () => {
    await ctx.db.execute(
      sql`CREATE FUNCTION reject_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'simulated audit failure'; END; $$ LANGUAGE plpgsql`,
    );
    await ctx.db.execute(
      sql`CREATE TRIGGER reject_audit_trigger BEFORE INSERT ON audit_events FOR EACH ROW EXECUTE FUNCTION reject_audit()`,
    );
    try {
      await expect(
        service.createRecord(admin, "suppliers", {
          ...supplierInput,
          name: "Rollback marker",
        }),
      ).rejects.toThrow();
      expect(
        (await service.listRecords(admin, "suppliers", "Rollback marker"))
          .total,
      ).toBe(0);
    } finally {
      await ctx.db.execute(
        sql`DROP TRIGGER reject_audit_trigger ON audit_events`,
      );
      await ctx.db.execute(sql`DROP FUNCTION reject_audit()`);
    }
  });
});

describe("costs, prices and purchase units", () => {
  it("preserves unknown costs and independent prices through edits", async () => {
    const milk = await service.createRecord(admin, "items", {
      name: "Leche",
      baseUnit: "ml",
      unitCost: "",
    });
    expect(milk.unitCost).toBeNull();
    const product = await service.createRecord(admin, "products", {
      name: "Taro Iced Latte",
      priceCounter: "7.000",
      pricePedidosYa: "7.500",
      priceUberEats: "",
    });
    const renamed = await service.updateRecord(admin, "items", milk.id, {
      revision: 1,
      name: "Leche entera",
      baseUnit: "ml",
      unitCost: "",
    });
    expect(renamed.unitCost).toBeNull();
    await service.updateRecord(admin, "items", milk.id, {
      revision: 2,
      name: "Leche entera",
      baseUnit: "ml",
      unitCost: "1,50",
    });
    expect(
      (await service.listRecords(admin, "products", "Taro")).rows[0],
    ).toMatchObject({
      id: product.id,
      priceCounter: "7000.00",
      pricePedidosYa: "7500.00",
      priceUberEats: null,
    });
    const zero = await service.createRecord(admin, "items", {
      name: "Costo cero declarado",
      baseUnit: "unit",
      unitCost: "0",
    });
    expect(zero.unitCost).toBe("0.000000");
  });
  it("keeps historical references and disallows new archived references", async () => {
    const supplier = await service.createRecord(admin, "suppliers", {
      ...supplierInput,
      name: "Distribuidora paquetes",
    });
    const item = await service.createRecord(admin, "items", {
      name: "Taro polvo",
      baseUnit: "g",
      unitCost: "54,208",
    });
    const input = {
      name: "Paquete de 800 g",
      supplierId: supplier.id,
      itemId: item.id,
      baseQuantity: "800",
    };
    const pack = await service.createRecord(admin, "presentations", input);
    expect(pack.baseQuantity).toBe("800.000000");
    expect(pack.baseUnit).toBe("g");
    await service.updateRecord(admin, "suppliers", supplier.id, {
      revision: 1,
      archived: true,
    });
    expect(
      (await service.listRecords(admin, "presentations", "800")).rows[0]
        .supplierName,
    ).toBe("Distribuidora paquetes");
    await expect(
      service.createRecord(admin, "presentations", input),
    ).rejects.toMatchObject({ code: "ARCHIVED_REFERENCE" });
    await expect(
      service.updateRecord(admin, "items", item.id, {
        revision: 1,
        name: "Taro polvo",
        baseUnit: "ml",
        unitCost: "54,208",
      }),
    ).rejects.toMatchObject({ code: "UNIT_IN_USE" });
    const edited = await service.updateRecord(admin, "presentations", pack.id, {
      ...input,
      name: "Bolsa de 800 g",
      revision: 1,
    });
    expect(edited.name).toBe("Bolsa de 800 g");
  });
  it("database rejects invalid numeric and orphan rows", async () => {
    await expect(
      ctx.db.insert(items).values({
        code: crypto.randomUUID(),
        class: "food",
        purchasable: true,
        recipeUsable: true,
        name: "Negativo",
        baseUnit: "g",
        unitCost: "-1",
      }),
    ).rejects.toThrow();
    const [s] = await ctx.db
      .insert(suppliers)
      .values({ name: "DB supplier" })
      .returning();
    const [i] = await ctx.db
      .insert(items)
      .values({
        code: crypto.randomUUID(),
        class: "food",
        purchasable: true,
        recipeUsable: true,
        name: "DB item",
        baseUnit: "unit",
      })
      .returning();
    await expect(
      ctx.db.insert(purchasePresentations).values({
        name: "Cero",
        supplierId: s.id,
        itemId: i.id,
        baseQuantity: "0",
      }),
    ).rejects.toThrow();
    await expect(
      ctx.db.insert(purchasePresentations).values({
        name: "Huérfano",
        supplierId: crypto.randomUUID(),
        itemId: i.id,
        baseQuantity: "1",
      }),
    ).rejects.toThrow();
  });
});
