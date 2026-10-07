import { randomUUID as uid } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./helpers/database";
import { user, items, inventoryOperations, inventoryLots } from "@/db/schema";
import { createRecipeService } from "@/modules/recipes/service";
import { createProductionService } from "@/modules/production/service";
import { createInventoryService } from "@/modules/inventory/service";
import type { Actor } from "@/lib/access";

const actor: Actor = { id: "production-admin", role: "admin" };
const now = () => new Date("2026-09-25T12:00:00Z");
let ctx: Awaited<ReturnType<typeof createTestDb>>;
let recipes: ReturnType<typeof createRecipeService>;
let service: ReturnType<typeof createProductionService>;
let inventory: ReturnType<typeof createInventoryService>;
beforeAll(async () => {
  ctx = await createTestDb();
  recipes = createRecipeService(ctx.db);
  service = createProductionService(ctx.db, now);
  inventory = createInventoryService(ctx.db, now);
  await ctx.db.insert(user).values({
    id: actor.id,
    name: "Fran",
    email: "production@test.local",
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});
afterAll(async () => {
  await ctx?.close();
});
async function fixture(cost: string | null = "2", repeated = false) {
  const [raw, output] = await ctx.db
    .insert(items)
    .values([
      {
        code: crypto.randomUUID(),
        class: "food",
        purchasable: true,
        recipeUsable: true,
        name: `Cruda ${uid()}`,
        baseUnit: "g",
        unitCost: cost,
      },
      {
        code: crypto.randomUUID(),
        class: "food",
        purchasable: true,
        recipeUsable: true,
        name: `Cocida ${uid()}`,
        baseUnit: "g",
        unitCost: null,
      },
    ])
    .returning();
  const line = {
    options: [{ itemId: raw.id, quantity: repeated ? "50" : "100" }],
  };
  const recipe = await recipes.save(actor, {
    requestId: uid(),
    kind: "preparation",
    targetId: output.id,
    yieldQuantity: "250",
    lines: repeated ? [line, line] : [line],
  });
  const input = {
    recipeId: recipe.id,
    revision: 1,
    multiplier: "1",
    actualOutput: "200",
    producedOn: "2026-09-25",
    expiresOn: "2026-09-27",
    lotCode: "COC-1",
    selections: recipe.lines.map((l) => ({
      lineId: l.id,
      optionId: l.options[0].id,
      quantity: repeated ? "50" : "100",
    })),
  };
  return { raw, output, recipe, input };
}
async function open(
  itemId: string,
  quantity = "100",
  expiresOn: string | null = "2026-09-28",
  unitCost: string | null = "2",
) {
  await inventory.adjust(actor, {
    requestId: uid(),
    kind: "opening",
    itemId,
    quantity,
    unitCost,
    receivedOn: "2026-09-24",
    expiresOn,
    reason: "Stock inicial",
  });
  return (await inventory.getLots(actor, itemId)).rows.find(
    (l) => l.expiresOn === expiresOn,
  )!;
}
async function record(input: unknown) {
  const preview = await service.preview(actor, input);
  return service.record(actor, {
    ...(input as object),
    requestId: uid(),
    previewToken: preview.token,
  });
}

describe("production ledger", () => {
  it("consumes FEFO usable lots, aggregates repeated items, transfers exact cost to actual yield", async () => {
    const { raw, output, input } = await fixture("2", true);
    await open(raw.id, "30", "2026-09-26");
    await open(raw.id, "100", "2026-09-28");
    await open(raw.id, "100", "2026-09-24");
    const blocked = await open(raw.id, "100", "2026-09-27");
    await inventory.adjust(actor, {
      requestId: uid(),
      kind: "block",
      lotId: blocked.id,
      revision: blocked.revision,
      blocked: true,
      reason: "Revisar",
    });
    const safe = { ...input, expiresOn: "2026-09-26" };
    const preview = await service.preview(actor, safe);
    expect(preview).toMatchObject({
      canConfirm: true,
      totalCost: "200.000000",
      unitCost: "1.000000",
      expectedOutput: "250.000000",
      yieldDifference: "-50.000000",
    });
    expect(preview.items).toHaveLength(1);
    expect(preview.items[0]).toMatchObject({
      needed: "100.000000",
      usable: "130.000000",
    });
    const batch = await record(safe);
    expect(batch.allocations.map((a) => a.quantity)).toEqual([
      "30.000000",
      "70.000000",
    ]);
    const stock = await inventory.getStock(actor);
    expect(stock.rows.find((r) => r.itemId === raw.id)?.physicalQuantity).toBe(
      "230.000000",
    );
    expect(stock.rows.find((r) => r.itemId === output.id)).toMatchObject({
      physicalQuantity: "200.000000",
      stockValue: "200.000000",
    });
    expect((await inventory.getMovements(actor, output.id)).rows[0].kind).toBe(
      "production_in",
    );
  });
  it("refuses shortages atomically and leaves the request key retryable", async () => {
    const { raw, output, input } = await fixture();
    await open(raw.id, "50");
    const preview = await service.preview(actor, input);
    expect(preview.canConfirm).toBe(false);
    expect(preview.items[0].shortfall).toBe("50.000000");
    const requestId = uid();
    await expect(
      service.record(actor, {
        ...input,
        requestId,
        previewToken: preview.token,
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
    expect(
      await ctx.db
        .select()
        .from(inventoryOperations)
        .where(eq(inventoryOperations.requestId, requestId)),
    ).toHaveLength(0);
    expect((await inventory.getLots(actor, output.id)).rows).toHaveLength(0);
    expect(
      (await inventory.getStock(actor)).rows.find((r) => r.itemId === raw.id)
        ?.physicalQuantity,
    ).toBe("50.000000");
  });
  it("invalidates a preview after stock changes and replays committed requests even after a recipe edit or date change", async () => {
    const { raw, recipe, input } = await fixture();
    await open(raw.id, "300");
    const preview = await service.preview(actor, input);
    await open(raw.id, "1", null);
    await expect(
      service.record(actor, {
        ...input,
        requestId: uid(),
        previewToken: preview.token,
      }),
    ).rejects.toMatchObject({ code: "STALE_PREVIEW" });
    const fresh = await service.preview(actor, input);
    const operation = { ...input, requestId: uid(), previewToken: fresh.token };
    const batch = await service.record(actor, operation);
    await recipes.save(actor, {
      requestId: uid(),
      id: recipe.id,
      revision: 1,
      kind: "preparation",
      targetId: recipe.targetId,
      yieldQuantity: "300",
      lines: [{ options: [{ itemId: raw.id, quantity: "120" }] }],
    });
    const tomorrow = createProductionService(
      ctx.db,
      () => new Date("2026-09-26T12:00:00Z"),
    );
    expect((await tomorrow.record(actor, operation)).id).toBe(batch.id);
    expect((await service.get(actor, batch.id)).expectedOutput).toBe(
      "250.000000",
    );
    await expect(
      service.record(actor, { ...operation, actualOutput: "201" }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(service.preview(actor, input)).rejects.toMatchObject({
      status: 409,
    });
  });
  it("propagates unknown cost, honors zero, and does not consume raw materials a second time for a prepared input", async () => {
    for (const cost of [null, "0"]) {
      const { raw, output, input } = await fixture(cost);
      await open(raw.id, "100", null, cost);
      const first = await record({ ...input, expiresOn: null });
      expect(first.totalCost).toBe(cost === null ? null : "0.000000");
      const [secondOutput] = await ctx.db
        .insert(items)
        .values({
          code: crypto.randomUUID(),
          class: "food",
          purchasable: true,
          recipeUsable: true,
          name: `Segunda ${uid()}`,
          baseUnit: "unit",
        })
        .returning();
      const secondRecipe = await recipes.save(actor, {
        requestId: uid(),
        kind: "preparation",
        targetId: secondOutput.id,
        yieldQuantity: "1",
        lines: [{ options: [{ itemId: output.id, quantity: "100" }] }],
      });
      await record({
        recipeId: secondRecipe.id,
        revision: 1,
        multiplier: "1",
        actualOutput: "1",
        producedOn: "2026-09-25",
        selections: [
          {
            lineId: secondRecipe.lines[0].id,
            optionId: secondRecipe.lines[0].options[0].id,
            quantity: "100",
          },
        ],
      });
      expect((await inventory.getMovements(actor, raw.id)).rows).toHaveLength(
        2,
      ); // opening + first production only
      expect(
        (await inventory.getStock(actor)).rows.find(
          (r) => r.itemId === output.id,
        )?.physicalQuantity,
      ).toBe("100.000000");
    }
  });
  it("rejects obsolete/invalid selections, unit overflow, expiry extension and non-current dates", async () => {
    const { raw, input } = await fixture();
    await open(raw.id, "100", "2026-09-26");
    await expect(service.preview(actor, input)).rejects.toMatchObject({
      status: 400,
    }); // expires after consumed lot
    for (const change of [
      { producedOn: "2026-09-24" },
      { actualOutput: "0" },
      { multiplier: "999999999999" },
      { selections: [] },
      { selections: [...input.selections, ...input.selections] },
      { expiresOn: "2026-09-25" },
    ]) {
      await expect(
        service.preview(actor, { ...input, expiresOn: null, ...change }),
      ).rejects.toMatchObject({ status: 400 });
    }
    await expect(
      service.list({ ...actor, role: "staff" }),
    ).rejects.toMatchObject({ status: 403 });
    await ctx.db
      .update(inventoryLots)
      .set({ blocked: true })
      .where(eq(inventoryLots.itemId, raw.id));
    expect(
      (await service.preview(actor, { ...input, expiresOn: null })).canConfirm,
    ).toBe(false);
  });
  it("preserves the last rounding remainder and concurrent retries create one output lot", async () => {
    const { raw, output, input } = await fixture();
    await open(raw.id, "2", "2026-09-27", "1");
    await open(raw.id, "1", "2026-09-28", "2");
    const production = {
      ...input,
      actualOutput: "3",
      selections: input.selections.map((s) => ({ ...s, quantity: "3" })),
    };
    const preview = await service.preview(actor, production);
    const operation = {
      ...production,
      requestId: uid(),
      previewToken: preview.token,
    };
    const [a, b] = await Promise.all([
      service.record(actor, operation),
      service.record(actor, operation),
    ]);
    expect(a.id).toBe(b.id);
    expect(a.totalCost).toBe("4.000000");
    expect(a.allocations.map((v) => v.totalCost)).toEqual([
      "2.666667",
      "1.333333",
    ]);
    expect((await inventory.getLots(actor, output.id)).rows).toHaveLength(1);
    expect(
      (await inventory.getStock(actor)).rows.find((r) => r.itemId === raw.id),
    ).toMatchObject({ physicalQuantity: "0.000000", stockValue: "0.000000" });
  });
});
