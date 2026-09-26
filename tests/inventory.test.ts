import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./helpers/database";
import { createInventoryService } from "../src/modules/inventory/service";
import { createCatalogService } from "../src/modules/catalog/service";
import { user } from "../src/db/auth-schema";
import {
  auditEvents,
  ingredients,
  purchasePresentations,
  suppliers,
  paymentMethods,
} from "../src/db/business-schema";
import {
  inventoryLots,
  inventoryMovements,
  inventoryOperations,
} from "../src/db/inventory-schema";

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let inventory: ReturnType<typeof createInventoryService>;
let catalog: ReturnType<typeof createCatalogService>;
const actor = { id: "inventory-owner", role: "admin" as const };
let supplierId: string,
  ingredientId: string,
  presentationId: string,
  paymentMethodId: string;
const uid = () => crypto.randomUUID();
const receipt = (requestId = uid()) => ({
  requestId,
  supplierId,
  receivedOn: "2026-09-25",
  documentNumber: " a-1 ",
  lines: [{ ingredientId, presentationId, quantity: "2", unitPrice: "1.000" }],
});

beforeAll(async () => {
  ctx = await createTestDb();
  inventory = createInventoryService(
    ctx.db,
    () => new Date("2026-09-25T12:00:00Z"),
  );
  catalog = createCatalogService(ctx.db);
  await ctx.db
    .insert(user)
    .values({
      id: actor.id,
      name: "Owner",
      email: "inventory@example.test",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  [supplierId, ingredientId, paymentMethodId] = await Promise.all([
    ctx.db
      .insert(suppliers)
      .values({ name: "Distribuidora" })
      .returning()
      .then(([r]) => r.id),
    ctx.db
      .insert(ingredients)
      .values({ name: "Polvo", baseUnit: "g" })
      .returning()
      .then(([r]) => r.id),
    ctx.db
      .insert(paymentMethods)
      .values({ name: "Efectivo", kind: "cash" })
      .returning()
      .then(([r]) => r.id),
  ]);
  [presentationId] = await ctx.db
    .insert(purchasePresentations)
    .values({
      name: "Paquete 800g",
      supplierId,
      ingredientId,
      baseQuantity: "800",
    })
    .returning()
    .then(([r]) => [r.id]);
});
afterAll(async () => {
  await ctx?.close();
});

describe("inventory ledger", () => {
  it("receives exact base units once despite retry, with durable audit", async () => {
    const input = receipt();
    const first = await inventory.receive(actor, input);
    expect(first).toMatchObject({
      documentNumber: "A-1",
      totalAmount: "2000.00",
      paidAmount: "0.00",
      balanceDue: "2000.00",
    });
    expect(first.lines[0]).toMatchObject({
      quantity: "2.000000",
      baseQuantity: "1600.000000",
      lineTotal: "2000.00",
    });
    expect((await inventory.receive(actor, input)).id).toBe(first.id);
    expect(
      (await inventory.getStock(actor)).rows.find(
        (row) => row.ingredientId === ingredientId,
      ),
    ).toMatchObject({
      physicalQuantity: "1600.000000",
      stockValue: "2000.000000",
    });
    expect(
      await ctx.db
        .select()
        .from(inventoryMovements)
        .where(eq(inventoryMovements.ingredientId, ingredientId)),
    ).toHaveLength(1);
    expect(
      await ctx.db
        .select()
        .from(auditEvents)
        .where(eq(auditEvents.recordId, first.id)),
    ).toHaveLength(1);
  });
  it("separates payment from stock and rejects duplicate documents, changed keys and overpayment", async () => {
    const first = (await inventory.listReceipts(actor)).rows[0];
    const input = {
      requestId: uid(),
      paymentMethodId,
      paidOn: "2026-09-25",
      amount: "500,25",
    };
    const paid = await inventory.pay(actor, first.id, input);
    expect(paid).toMatchObject({ paidAmount: "500.25", balanceDue: "1499.75" });
    expect((await inventory.pay(actor, first.id, input)).payments).toHaveLength(
      1,
    );
    await expect(
      inventory.pay(actor, first.id, { ...input, amount: "1" }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      inventory.pay(actor, first.id, {
        ...input,
        requestId: uid(),
        amount: "1.500",
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      inventory.receive(actor, receipt(uid())),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      await ctx.db
        .select()
        .from(inventoryMovements)
        .where(eq(inventoryMovements.ingredientId, ingredientId)),
    ).toHaveLength(1);
  });
  it("preserves catalog snapshots, rejects inactive entries and locks used base units", async () => {
    const first = (await inventory.listReceipts(actor)).rows[0];
    await catalog.updateRecord(actor, "presentations", presentationId, {
      revision: 1,
      name: "Bolsa nueva",
      supplierId,
      ingredientId,
      baseQuantity: "900",
    });
    expect(
      (await inventory.getReceipt(actor, first.id)).lines[0],
    ).toMatchObject({
      presentationName: "Paquete 800g",
      conversionFactor: "800.000000",
    });
    await expect(
      catalog.updateRecord(actor, "ingredients", ingredientId, {
        revision: 1,
        name: "Polvo",
        baseUnit: "ml",
        unitCost: "",
      }),
    ).rejects.toMatchObject({ code: "UNIT_IN_USE" });
    await catalog.updateRecord(actor, "ingredients", ingredientId, {
      revision: 1,
      archived: true,
    });
    await expect(
      inventory.receive(actor, { ...receipt(uid()), documentNumber: "A-2" }),
    ).rejects.toMatchObject({ code: "ARCHIVED_REFERENCE" });
  });
  it("records weighted average waste and protects stale lot revision", async () => {
    const [extra] = await ctx.db
      .insert(ingredients)
      .values({ name: "Aceite", baseUnit: "ml" })
      .returning();
    const opening1 = await inventory.adjust(actor, {
      requestId: uid(),
      kind: "opening",
      ingredientId: extra.id,
      quantity: "4",
      unitCost: "1",
      receivedOn: "2026-09-24",
      reason: "Inicial",
    });
    await inventory.adjust(actor, {
      requestId: uid(),
      kind: "opening",
      ingredientId: extra.id,
      quantity: "4",
      unitCost: "3",
      receivedOn: "2026-09-24",
      reason: "Ingreso",
    });
    expect(
      (await inventory.getStock(actor)).rows.find(
        (r) => r.ingredientId === extra.id,
      ),
    ).toMatchObject({ stockValue: "16.000000", averageCost: "2.000000" });
    const wasted = await inventory.adjust(actor, {
      requestId: uid(),
      kind: "waste",
      lotId: opening1.lot.id,
      revision: opening1.lot.revision,
      quantity: "2",
      reason: "Rotura",
    });
    expect(wasted.lot.remainingQuantity).toBe("2.000000");
    expect(
      (await inventory.getMovements(actor, extra.id)).rows[0],
    ).toMatchObject({
      kind: "waste",
      delta: "-2.000000",
      valueDelta: "-4.000000",
    });
    await expect(
      inventory.adjust(actor, {
        requestId: uid(),
        kind: "count",
        lotId: opening1.lot.id,
        revision: opening1.lot.revision,
        countedQuantity: "3",
        reason: "Conteo",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      (await inventory.getStock(actor)).rows.find(
        (r) => r.ingredientId === extra.id,
      )?.physicalQuantity,
    ).toBe("6.000000");
  });
  it("keeps unknown and explicit zero value distinct; expiry and blocking affect only usable stock", async () => {
    const [extra] = await ctx.db
      .insert(ingredients)
      .values({ name: "Leche", baseUnit: "ml" })
      .returning();
    const unknown = await inventory.adjust(actor, {
      requestId: uid(),
      kind: "opening",
      ingredientId: extra.id,
      quantity: "2",
      receivedOn: "2026-09-25",
      expiresOn: "2026-09-25",
      reason: "Inicial",
    });
    await inventory.adjust(actor, {
      requestId: uid(),
      kind: "opening",
      ingredientId: extra.id,
      quantity: "3",
      unitCost: "0",
      receivedOn: "2026-09-25",
      reason: "Gratis",
    });
    expect(
      (await inventory.getStock(actor)).rows.find(
        (r) => r.ingredientId === extra.id,
      ),
    ).toMatchObject({
      physicalQuantity: "5.000000",
      expiredQuantity: "2.000000",
      usableQuantity: "3.000000",
      stockValue: null,
    });
    await inventory.adjust(actor, {
      requestId: uid(),
      kind: "block",
      lotId: unknown.lot.id,
      revision: unknown.lot.revision,
      blocked: true,
      reason: "Retenido",
    });
    expect(
      (await inventory.getLots(actor, extra.id)).rows.find(
        (r) => r.id === unknown.lot.id,
      ),
    ).toMatchObject({ blocked: true, expired: true });
    await expect(
      inventory.listReceipts({ id: actor.id, role: "staff" }),
    ).rejects.toMatchObject({ status: 403 });
  });
});

describe("transaction boundaries and exact costs", () => {
  it("rounds each priced line before discounts and preserves pending versus zero", async () => {
    const [i] = await ctx.db
      .insert(ingredients)
      .values({ name: "Fractional", baseUnit: "g" })
      .returning();
    const unknown = await inventory.receive(actor, {
      requestId: uid(),
      supplierId,
      receivedOn: "2026-09-25",
      lines: [{ ingredientId: i.id, quantity: "1", lotCode: "UNKNOWN" }],
    });
    expect(unknown.totalAmount).toBeNull();
    await expect(
      inventory.pay(actor, unknown.id, {
        requestId: uid(),
        paymentMethodId,
        paidOn: "2026-09-25",
        amount: "1",
      }),
    ).rejects.toMatchObject({ status: 409 });
    const priced = await inventory.receive(actor, {
      requestId: uid(),
      supplierId,
      receivedOn: "2026-09-25",
      lines: [
        {
          ingredientId: i.id,
          quantity: "0,333333",
          unitPrice: "3",
          discount: "0,01",
        },
        { ingredientId: i.id, quantity: "1", unitPrice: "0" },
      ],
    });
    expect(priced).toMatchObject({ totalAmount: "0.99" });
    expect(priced.lines.map((l) => l.lineTotal)).toEqual(["0.99", "0.00"]);
    expect(
      (await inventory.getStock(actor)).rows.find(
        (r) => r.ingredientId === i.id,
      ),
    ).toMatchObject({ physicalQuantity: "2.333333", stockValue: null });
  });
  it("restarts value after exhaustion and leaves positive count on exhausted unknown lot pending", async () => {
    const [i] = await ctx.db
      .insert(ingredients)
      .values({ name: "Reset", baseUnit: "unit" })
      .returning();
    const first = await inventory.adjust(actor, {
      requestId: uid(),
      kind: "opening",
      ingredientId: i.id,
      quantity: "1",
      receivedOn: "2026-09-25",
      reason: "Inicial",
    });
    const zero = await inventory.adjust(actor, {
      requestId: uid(),
      kind: "waste",
      lotId: first.lot.id,
      revision: 1,
      quantity: "1",
      reason: "Merma",
    });
    expect(
      (await inventory.getStock(actor)).rows.find(
        (r) => r.ingredientId === i.id,
      ),
    ).toMatchObject({ physicalQuantity: "0.000000", stockValue: "0.000000" });
    await inventory.adjust(actor, {
      requestId: uid(),
      kind: "count",
      lotId: zero.lot.id,
      revision: 2,
      countedQuantity: "1",
      reason: "Reconteo",
    });
    expect(
      (await inventory.getStock(actor)).rows.find(
        (r) => r.ingredientId === i.id,
      ),
    ).toMatchObject({ physicalQuantity: "1.000000", stockValue: null });
  });
  it("rolls back a multi-line receipt when a later line is invalid", async () => {
    const [i] = await ctx.db
      .insert(ingredients)
      .values({ name: "Rollback stock", baseUnit: "g" })
      .returning();
    const before = await ctx.db.select().from(inventoryOperations);
    await expect(
      inventory.receive(actor, {
        requestId: uid(),
        supplierId,
        receivedOn: "2026-09-25",
        lines: [
          { ingredientId: i.id, quantity: "1", unitPrice: "5" },
          { ingredientId: i.id, quantity: "1", unitPrice: "1", discount: "2" },
        ],
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      (await inventory.getStock(actor)).rows.find(
        (r) => r.ingredientId === i.id,
      ),
    ).toBeUndefined();
    expect(await ctx.db.select().from(inventoryOperations)).toHaveLength(
      before.length,
    );
  });
  it("rejects key reuse by another actor, even with identical payload", async () => {
    const [i] = await ctx.db
      .insert(ingredients)
      .values({ name: "Key guard", baseUnit: "unit" })
      .returning();
    const input = {
      requestId: uid(),
      kind: "opening" as const,
      ingredientId: i.id,
      quantity: "1",
      receivedOn: "2026-09-25",
      reason: "Inicial",
    };
    await inventory.adjust(actor, input);
    await expect(
      inventory.adjust({ id: "other-owner", role: "manager" }, input),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("serializes simultaneous payments against one known total", async () => {
    const [i] = await ctx.db
      .insert(ingredients)
      .values({ name: "Concurrent", baseUnit: "unit" })
      .returning();
    const r = await inventory.receive(actor, {
      requestId: uid(),
      supplierId,
      receivedOn: "2026-09-25",
      lines: [{ ingredientId: i.id, quantity: "1", unitPrice: "10" }],
    });
    const payment = (requestId: string) =>
      inventory.pay(actor, r.id, {
        requestId,
        paymentMethodId,
        paidOn: "2026-09-25",
        amount: "7",
      });
    const results = await Promise.allSettled([payment(uid()), payment(uid())]);
    expect(results.filter((v) => v.status === "fulfilled")).toHaveLength(1);
    expect((await inventory.getReceipt(actor, r.id)).paidAmount).toBe("7.00");
  });
});

describe("concurrent retries and business dates", () => {
  it("returns one receipt for simultaneous identical request keys", async () => {
    const [i] = await ctx.db
      .insert(ingredients)
      .values({ name: "Parallel receive", baseUnit: "unit" })
      .returning();
    const input = {
      requestId: uid(),
      supplierId,
      receivedOn: "2026-09-25",
      lines: [{ ingredientId: i.id, quantity: "1", unitPrice: "10" }],
    };
    const results = await Promise.all([
      inventory.receive(actor, input),
      inventory.receive(actor, input),
    ]);
    expect(results[0].id).toBe(results[1].id);
    expect(
      (await inventory.getStock(actor)).rows.find(
        (r) => r.ingredientId === i.id,
      )?.physicalQuantity,
    ).toBe("1.000000");
  });
  it("returns one adjusted lot for simultaneous identical request keys", async () => {
    const [i] = await ctx.db
      .insert(ingredients)
      .values({ name: "Parallel adjust", baseUnit: "unit" })
      .returning();
    const input = {
      requestId: uid(),
      kind: "opening" as const,
      ingredientId: i.id,
      quantity: "1",
      receivedOn: "2026-09-25",
      reason: "Inicial",
    };
    const [a, b] = await Promise.all([
      inventory.adjust(actor, input),
      inventory.adjust(actor, input),
    ]);
    expect(a.lot.id).toBe(b.lot.id);
    expect(
      (await inventory.getStock(actor)).rows.find(
        (r) => r.ingredientId === i.id,
      )?.physicalQuantity,
    ).toBe("1.000000");
  });
  it("returns one payment for simultaneous identical request keys", async () => {
    const [i] = await ctx.db
      .insert(ingredients)
      .values({ name: "Parallel pay", baseUnit: "unit" })
      .returning();
    const r = await inventory.receive(actor, {
      requestId: uid(),
      supplierId,
      receivedOn: "2026-09-25",
      lines: [{ ingredientId: i.id, quantity: "1", unitPrice: "10" }],
    });
    const input = {
      requestId: uid(),
      paymentMethodId,
      paidOn: "2026-09-25",
      amount: "7",
    };
    const [a, b] = await Promise.all([
      inventory.pay(actor, r.id, input),
      inventory.pay(actor, r.id, input),
    ]);
    expect(a.payments[0].id).toBe(b.payments[0].id);
    expect((await inventory.getReceipt(actor, r.id)).paidAmount).toBe("7.00");
  });
  it("rejects a future business date while allowing already expired merchandise", async () => {
    const [i] = await ctx.db
      .insert(ingredients)
      .values({ name: "Date check", baseUnit: "unit" })
      .returning();
    await expect(
      inventory.receive(actor, {
        requestId: uid(),
        supplierId,
        receivedOn: "2026-09-26",
        lines: [{ ingredientId: i.id, quantity: "1" }],
      }),
    ).rejects.toMatchObject({ status: 400 });
    const r = await inventory.receive(actor, {
      requestId: uid(),
      supplierId,
      receivedOn: "2026-09-25",
      lines: [{ ingredientId: i.id, quantity: "1", expiresOn: "2026-09-24" }],
    });
    expect((await inventory.getLots(actor, i.id)).rows[0]).toMatchObject({
      receiptId: r.id,
      expired: true,
    });
  });
});

describe("inventory history and pagination", () => {
  it("locks an ingredient base unit after all of its stock was consumed", async () => {
    const [i] = await ctx.db
      .insert(ingredients)
      .values({ name: "History only", baseUnit: "g" })
      .returning();
    const opened = await inventory.adjust(actor, {
      requestId: uid(),
      kind: "opening",
      ingredientId: i.id,
      quantity: "1",
      receivedOn: "2026-09-25",
      reason: "Inicial",
    });
    await inventory.adjust(actor, {
      requestId: uid(),
      kind: "waste",
      lotId: opened.lot.id,
      revision: 1,
      quantity: "1",
      reason: "Merma",
    });
    await expect(
      catalog.updateRecord(actor, "ingredients", i.id, {
        revision: 1,
        name: "History only",
        baseUnit: "ml",
        unitCost: "",
      }),
    ).rejects.toMatchObject({ code: "UNIT_IN_USE" });
  });
  it("keeps more than 100 lots accessible, with positive quantities ahead of exhausted ones", async () => {
    const [i] = await ctx.db
      .insert(ingredients)
      .values({ name: "Many lots", baseUnit: "unit" })
      .returning();
    // Direct fixture uses the migrated schema; the service's offset and ordering are the behavior tested.
    const rows = Array.from({ length: 102 }, (_, index) => ({
      ingredientId: i.id,
      receivedOn: "2026-09-25",
      initialQuantity: "1",
      remainingQuantity: index === 0 ? "0" : "1",
      expiresOn: index === 101 ? "2026-09-26" : null,
    }));
    await ctx.db.insert(inventoryLots).values(rows);
    const first = await inventory.getLots(actor, i.id);
    const second = await inventory.getLots(actor, i.id, 100);
    expect(first.total).toBe(102);
    expect(first.rows).toHaveLength(100);
    expect(second.rows).toHaveLength(2);
    expect(first.rows[0]).toMatchObject({
      expiresOn: "2026-09-26",
      remainingQuantity: "1.000000",
    });
    expect(second.rows.at(-1)?.remainingQuantity).toBe("0.000000");
    await expect(inventory.getLots(actor, i.id, -1)).rejects.toMatchObject({
      status: 400,
    });
  });
  it("rejects fractional presentation conversions that exceed six base decimals", async () => {
    const [i] = await ctx.db
      .insert(ingredients)
      .values({ name: "Tiny fractional", baseUnit: "g" })
      .returning();
    const [p] = await ctx.db
      .insert(purchasePresentations)
      .values({
        name: "Fraction",
        ingredientId: i.id,
        supplierId,
        baseQuantity: "0.333333",
      })
      .returning();
    await expect(
      inventory.receive(actor, {
        requestId: uid(),
        supplierId,
        receivedOn: "2026-09-25",
        lines: [
          {
            ingredientId: i.id,
            presentationId: p.id,
            quantity: "0,5",
            unitPrice: "1",
          },
        ],
      }),
    ).rejects.toMatchObject({ status: 400 });
    expect(
      (await inventory.getStock(actor)).rows.find(
        (r) => r.ingredientId === i.id,
      ),
    ).toBeUndefined();
  });
});

describe("reviving exhausted lots", () => {
  it("does not assign a newer ingredient average to an originally unknown lot", async () => {
    const [i] = await ctx.db
      .insert(ingredients)
      .values({ name: "Unknown old lot", baseUnit: "unit" })
      .returning();
    const unknown = await inventory.adjust(actor, {
      requestId: uid(),
      kind: "opening",
      ingredientId: i.id,
      quantity: "1",
      receivedOn: "2026-09-25",
      reason: "Inicial",
    });
    const exhausted = await inventory.adjust(actor, {
      requestId: uid(),
      kind: "waste",
      lotId: unknown.lot.id,
      revision: 1,
      quantity: "1",
      reason: "Merma",
    });
    await inventory.adjust(actor, {
      requestId: uid(),
      kind: "opening",
      ingredientId: i.id,
      quantity: "1",
      unitCost: "10",
      receivedOn: "2026-09-25",
      reason: "Compra nueva",
    });
    expect(
      (await inventory.getStock(actor)).rows.find(
        (r) => r.ingredientId === i.id,
      )?.stockValue,
    ).toBe("10.000000");
    await inventory.adjust(actor, {
      requestId: uid(),
      kind: "count",
      lotId: unknown.lot.id,
      revision: exhausted.lot.revision,
      countedQuantity: "1",
      reason: "Hallazgo",
    });
    expect(
      (await inventory.getStock(actor)).rows.find(
        (r) => r.ingredientId === i.id,
      ),
    ).toMatchObject({ physicalQuantity: "2.000000", stockValue: null });
  });
});

describe("catalog review revisions", () => {
  it("rejects a changed presentation factor instead of silently receiving a different amount", async () => {
    const [i] = await ctx.db
      .insert(ingredients)
      .values({ name: "Review pack", baseUnit: "g" })
      .returning();
    const [p] = await ctx.db
      .insert(purchasePresentations)
      .values({
        name: "Pack",
        supplierId,
        ingredientId: i.id,
        baseQuantity: "800",
      })
      .returning();
    const input = {
      requestId: uid(),
      supplierId,
      receivedOn: "2026-09-25",
      lines: [
        {
          ingredientId: i.id,
          ingredientRevision: 1,
          presentationId: p.id,
          presentationRevision: 1,
          quantity: "2",
          unitPrice: "100",
        },
      ],
    };
    await catalog.updateRecord(actor, "presentations", p.id, {
      revision: 1,
      name: "Pack",
      supplierId,
      ingredientId: i.id,
      baseQuantity: "900",
    });
    await expect(inventory.receive(actor, input)).rejects.toMatchObject({
      status: 409,
    });
    expect(
      (await inventory.getStock(actor)).rows.find(
        (r) => r.ingredientId === i.id,
      ),
    ).toBeUndefined();
  });
  it("rejects a changed base unit under a previously reviewed ingredient", async () => {
    const [i] = await ctx.db
      .insert(ingredients)
      .values({ name: "Review unit", baseUnit: "g" })
      .returning();
    const input = {
      requestId: uid(),
      supplierId,
      receivedOn: "2026-09-25",
      lines: [
        {
          ingredientId: i.id,
          ingredientRevision: 1,
          quantity: "2",
          unitPrice: "1",
        },
      ],
    };
    await catalog.updateRecord(actor, "ingredients", i.id, {
      revision: 1,
      name: "Review unit",
      baseUnit: "ml",
      unitCost: "",
    });
    await expect(inventory.receive(actor, input)).rejects.toMatchObject({
      status: 409,
    });
  });
});

describe("archived ingredient exits", () => {
  it("rejects positive counts while allowing count-down and waste of existing stock", async () => {
    const [i] = await ctx.db
      .insert(ingredients)
      .values({ name: "Archived count", baseUnit: "g" })
      .returning();
    const opened = await inventory.adjust(actor, {
      requestId: uid(),
      kind: "opening",
      ingredientId: i.id,
      quantity: "3",
      unitCost: "10",
      receivedOn: "2026-09-25",
      reason: "Inicial",
    });
    await catalog.updateRecord(actor, "ingredients", i.id, {
      revision: 1,
      archived: true,
    });
    await expect(
      inventory.adjust(actor, {
        requestId: uid(),
        kind: "count",
        lotId: opened.lot.id,
        revision: opened.lot.revision,
        countedQuantity: "4",
        reason: "Conteo",
      }),
    ).rejects.toMatchObject({ code: "ARCHIVED_REFERENCE", status: 409 });
    expect(
      (await inventory.getStock(actor)).rows.find(
        (r) => r.ingredientId === i.id,
      ),
    ).toMatchObject({ physicalQuantity: "3.000000", stockValue: "30.000000" });
    const down = await inventory.adjust(actor, {
      requestId: uid(),
      kind: "count",
      lotId: opened.lot.id,
      revision: opened.lot.revision,
      countedQuantity: "2",
      reason: "Conteo",
    });
    await inventory.adjust(actor, {
      requestId: uid(),
      kind: "waste",
      lotId: down.lot.id,
      revision: down.lot.revision,
      quantity: "1",
      reason: "Merma",
    });
    expect(
      (await inventory.getStock(actor)).rows.find(
        (r) => r.ingredientId === i.id,
      ),
    ).toMatchObject({ physicalQuantity: "1.000000", stockValue: "10.000000" });
  });
});

describe("numeric persistence bounds", () => {
  it("rejects an opening whose computed stock value exceeds numeric precision", async () => {
    const [i] = await ctx.db
      .insert(ingredients)
      .values({ name: "Value overflow", baseUnit: "unit" })
      .returning();
    const before = (await ctx.db.select().from(inventoryOperations)).length;
    await expect(
      inventory.adjust(actor, {
        requestId: uid(),
        kind: "opening",
        ingredientId: i.id,
        quantity: "999999999999",
        unitCost: "999999999999",
        receivedOn: "2026-09-25",
        reason: "Prueba",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION", status: 400 });
    expect(
      (await inventory.getStock(actor)).rows.find(
        (r) => r.ingredientId === i.id,
      ),
    ).toBeUndefined();
    expect(await ctx.db.select().from(inventoryOperations)).toHaveLength(
      before,
    );
  });
  it("rejects a receipt whose total exceeds monetary precision", async () => {
    const [i] = await ctx.db
      .insert(ingredients)
      .values({ name: "Receipt overflow", baseUnit: "unit" })
      .returning();
    const before = (await ctx.db.select().from(inventoryOperations)).length;
    await expect(
      inventory.receive(actor, {
        requestId: uid(),
        supplierId,
        receivedOn: "2026-09-25",
        lines: [
          {
            ingredientId: i.id,
            quantity: "999999999999",
            unitPrice: "999999999999",
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION", status: 400 });
    expect(
      (await inventory.getStock(actor)).rows.find(
        (r) => r.ingredientId === i.id,
      ),
    ).toBeUndefined();
    expect(await ctx.db.select().from(inventoryOperations)).toHaveLength(
      before,
    );
  });
});
