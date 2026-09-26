import { randomUUID as uid } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "./helpers/database";
import { user, ingredients, products } from "@/db/schema";
import { createRecipeService } from "@/modules/recipes/service";
import { createCatalogService } from "@/modules/catalog/service";
import type { Actor } from "@/lib/access";

const actor: Actor = { id: "recipe-admin", role: "admin" };
let ctx: Awaited<ReturnType<typeof createTestDb>>;
let service: ReturnType<typeof createRecipeService>;
beforeAll(async () => {
  ctx = await createTestDb();
  service = createRecipeService(ctx.db);
  await ctx.db
    .insert(user)
    .values({
      id: actor.id,
      name: "Fran",
      email: "recipe@test.local",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
});
afterAll(async () => {
  await ctx?.close();
});
async function ingredient(
  name: string,
  cost: string | null = "2",
  baseUnit = "g",
) {
  const [row] = await ctx.db
    .insert(ingredients)
    .values({ name, unitCost: cost, baseUnit })
    .returning();
  return row;
}
async function product() {
  const [row] = await ctx.db
    .insert(products)
    .values({ name: "Bebida" })
    .returning();
  return row;
}
const line = (id: string, quantity = "10", optional = false) => ({
  optional,
  options: [{ ingredientId: id, quantity }],
});

describe("versioned recipes", () => {
  it("persists immutable versions and safely retries an old save", async () => {
    const raw = await ingredient("Polvo");
    const target = await product();
    const input = {
      requestId: uid(),
      kind: "product",
      targetId: target.id,
      yieldQuantity: "1",
      lines: [line(raw.id)],
    };
    const first = await service.save(actor, input);
    expect(first).toMatchObject({
      revision: 1,
      name: "Bebida",
      cost: { totalCost: "20.000000", unitCost: "20.000000" },
    });
    const second = await service.save(actor, {
      ...input,
      requestId: uid(),
      id: first.id,
      revision: 1,
      lines: [line(raw.id, "15")],
    });
    expect(second.revision).toBe(2);
    expect(second.versions).toHaveLength(2);
    const retry = await service.save(actor, input);
    expect(retry.versionId).toBe(first.versionId);
    expect(retry.lines[0].options[0].quantity).toBe("10.000000");
    await expect(
      service.save(actor, { ...input, lines: [line(raw.id, "16")] }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.save(actor, {
        ...input,
        requestId: uid(),
        id: first.id,
        revision: 1,
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
  it("compares alternatives and omission, preserving unknown costs versus explicit zero", async () => {
    const unknown = await ingredient("Sin precio", null);
    const free = await ingredient("Agua", "0");
    const target = await product();
    const recipe = await service.save(actor, {
      requestId: uid(),
      kind: "product",
      targetId: target.id,
      yieldQuantity: "1",
      lines: [
        {
          optional: true,
          options: [
            { ingredientId: unknown.id, quantity: "1" },
            { ingredientId: free.id, quantity: "1" },
          ],
        },
      ],
    });
    expect(recipe.cost).toMatchObject({
      unitCost: null,
      missing: ["Sin precio"],
    });
    const selection = {
      revision: 1,
      selections: [
        { lineId: recipe.lines[0].id, optionId: recipe.lines[0].options[1].id },
      ],
    };
    expect(await service.cost(actor, recipe.id, selection)).toMatchObject({
      unitCost: "0.000000",
      missing: [],
    });
    expect(
      await service.cost(actor, recipe.id, {
        ...selection,
        selections: [{ lineId: recipe.lines[0].id, optionId: null }],
      }),
    ).toMatchObject({ unitCost: "0.000000" });
    await expect(
      service.cost(actor, recipe.id, {
        ...selection,
        selections: [{ lineId: uid(), optionId: null }],
      }),
    ).rejects.toMatchObject({ status: 400 });
  });
  it("costs preparations recursively without inventing an ingredient price", async () => {
    const raw = await ingredient("Cruda", "1,25".replace(",", "."));
    const output = await ingredient("Cocida", null);
    const target = await product();
    await service.save(actor, {
      requestId: uid(),
      kind: "preparation",
      targetId: output.id,
      yieldQuantity: "250",
      lines: [line(raw.id, "100")],
    });
    const recipe = await service.save(actor, {
      requestId: uid(),
      kind: "product",
      targetId: target.id,
      yieldQuantity: "1",
      lines: [line(output.id, "50")],
    });
    expect(recipe.cost.unitCost).toBe("25.000000");
    expect(
      (
        await ctx.db
          .select()
          .from(ingredients)
          .where(eq(ingredients.id, output.id))
      )[0].unitCost,
    ).toBeNull();
  });
  it("rejects cycles through alternatives and direct output consumption", async () => {
    const a = await ingredient("A");
    const b = await ingredient("B");
    const c = await ingredient("C");
    await service.save(actor, {
      requestId: uid(),
      kind: "preparation",
      targetId: a.id,
      yieldQuantity: "1",
      lines: [
        {
          options: [
            { ingredientId: c.id, quantity: "1" },
            { ingredientId: b.id, quantity: "1" },
          ],
        },
      ],
    });
    await expect(
      service.save(actor, {
        requestId: uid(),
        kind: "preparation",
        targetId: b.id,
        yieldQuantity: "1",
        lines: [line(a.id)],
      }),
    ).rejects.toMatchObject({ code: "RECIPE_CYCLE" });
    await expect(
      service.save(actor, {
        requestId: uid(),
        kind: "preparation",
        targetId: c.id,
        yieldQuantity: "1",
        lines: [line(c.id)],
      }),
    ).rejects.toMatchObject({ code: "RECIPE_CYCLE" });
  });
  it("protects referenced units and immutable targets, rejects archived ingredients and staff", async () => {
    const raw = await ingredient("Unidad fija");
    const output = await ingredient("Preparado fijo");
    const input = {
      requestId: uid(),
      kind: "preparation",
      targetId: output.id,
      yieldQuantity: "20",
      lines: [line(raw.id)],
    };
    const recipe = await service.save(actor, input);
    const catalog = createCatalogService(ctx.db);
    for (const row of [raw, output]) {
      await expect(
        catalog.updateRecord(actor, "ingredients", row.id, {
          revision: 1,
          name: row.name,
          baseUnit: "ml",
          unitCost: "2",
        }),
      ).rejects.toMatchObject({ status: 409 });
    }
    await expect(
      service.save(actor, {
        ...input,
        requestId: uid(),
        id: recipe.id,
        revision: 1,
        targetId: raw.id,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await ctx.db
      .update(ingredients)
      .set({ archivedAt: new Date() })
      .where(eq(ingredients.id, raw.id));
    await expect(
      service.save(actor, {
        ...input,
        requestId: uid(),
        id: recipe.id,
        revision: 1,
      }),
    ).rejects.toMatchObject({ status: 409 });
    await expect(
      service.list({ ...actor, role: "staff" }),
    ).rejects.toMatchObject({ status: 403 });
  });
});
