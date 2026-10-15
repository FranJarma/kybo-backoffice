import { beforeAll, afterAll, it, expect } from "vitest";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { createCatalogService } from "../src/modules/catalog/service";
import { moveCatalogRecord } from "../src/modules/catalog/ordering";
import { user, operationalUsers } from "../src/db/auth-schema";
import type { Actor } from "../src/lib/access";
import { productCategories } from "../src/db/business-schema";
let ctx: Awaited<ReturnType<typeof createDataModelTestContext>>;
const actor: Actor = { id: "ordering-test", role: "admin" };
beforeAll(async () => {
  ctx = await createDataModelTestContext();
  await ctx.db
    .insert(user)
    .values({ id: actor.id, name: "Test", email: "ordering@test.invalid" });
  await ctx.db
    .insert(operationalUsers)
    .values({ userId: actor.id, role: "admin" });
});
afterAll(async () => {
  await ctx?.close();
});
it.each(["products", "categories"] as const)(
  "ordena %s automáticamente y conserva el orden al editar",
  async (entity) => {
    const service = createCatalogService(ctx.db);
    const fields = (name: string) =>
      entity === "products"
        ? { name, priceCounter: "1", pricePedidosYa: "", priceUberEats: "" }
        : { name };
    const a = await service.createRecord(actor, entity, fields("Zeta"));
    const b = await service.createRecord(actor, entity, fields("Alfa"));
    expect(Number(b.sortOrder)).toBeGreaterThan(Number(a.sortOrder));
    await moveCatalogRecord(ctx.db, actor, entity, b.id, {
      revision: b.revision,
      direction: "up",
    });
    let list = await service.listRecords(actor, entity);
    expect(list.rows.map((r) => r.id)).toEqual([b.id, a.id]);
    await expect(
      moveCatalogRecord(ctx.db, actor, entity, b.id, {
        revision: b.revision,
        direction: "up",
      }),
    ).rejects.toMatchObject({ status: 409 });
    const current = list.rows[0];
    await service.updateRecord(actor, entity, b.id, {
      ...fields("Alfa editado"),
      revision: current.revision,
    });
    list = await service.listRecords(actor, entity);
    expect(list.rows.map((r) => r.id)).toEqual([b.id, a.id]);
    const c = await service.createRecord(actor, entity, fields("Nuevo"));
    list = await service.listRecords(actor, entity);
    expect(list.rows.map((r) => r.id)).toEqual([b.id, a.id, c.id]);
    await expect(
      moveCatalogRecord(
        ctx.db,
        { id: "unauthorized", role: "staff" },
        entity,
        c.id,
        { revision: c.revision, direction: "up" },
      ),
    ).rejects.toMatchObject({ status: 403 });
  },
);
it("reordena empates antiguos, admite bajar y respeta los extremos", async () => {
  await ctx.db.update(productCategories).set({ sortOrder: 0 });
  const service = createCatalogService(ctx.db);
  const before = (await service.listRecords(actor, "categories")).rows;
  const second = before[1];
  await moveCatalogRecord(ctx.db, actor, "categories", second.id, {
    revision: second.revision,
    direction: "up",
  });
  let rows = (await service.listRecords(actor, "categories")).rows;
  expect(rows.map((r) => r.id)).toEqual([
    before[1].id,
    before[0].id,
    before[2].id,
  ]);
  await expect(
    moveCatalogRecord(ctx.db, actor, "categories", second.id, {
      revision: second.revision,
      direction: "up",
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    await moveCatalogRecord(ctx.db, actor, "categories", rows[0].id, {
      revision: rows[0].revision,
      direction: "up",
    }),
  ).toEqual({ moved: false });
  await moveCatalogRecord(ctx.db, actor, "categories", rows[0].id, {
    revision: rows[0].revision,
    direction: "down",
  });
  rows = (await service.listRecords(actor, "categories")).rows;
  expect(rows.map((r) => r.id)).toEqual(before.map((r) => r.id));
});

it("permite arrastrar a una posición no adyacente y rechaza destinos desactualizados", async () => {
  const service = createCatalogService(ctx.db);
  let rows = (await service.listRecords(actor, "categories")).rows;
  const [first, , last] = rows;
  await moveCatalogRecord(ctx.db, actor, "categories", first.id, {
    revision: first.revision,
    targetId: last.id,
    targetRevision: last.revision,
    placement: "after",
  });
  rows = (await service.listRecords(actor, "categories")).rows;
  expect(rows.map((r) => r.id)).toEqual([rows[0].id, last.id, first.id]);
  expect(rows[0].id).not.toBe(first.id);
  await expect(
    moveCatalogRecord(ctx.db, actor, "categories", rows[0].id, {
      revision: rows[0].revision,
      targetId: last.id,
      targetRevision: last.revision,
      placement: "before",
    }),
  ).rejects.toMatchObject({ status: 409 });
  await moveCatalogRecord(ctx.db, actor, "categories", rows[2].id, {
    revision: rows[2].revision,
    targetId: rows[0].id,
    targetRevision: rows[0].revision,
    placement: "before",
  });
  expect((await service.listRecords(actor, "categories")).rows[0].id).toBe(
    first.id,
  );
});
