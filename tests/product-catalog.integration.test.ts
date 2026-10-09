import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { createDataModelTestContext } from "./helpers/data-model-database";
import { createCatalogService } from "../src/modules/catalog/service";
import { user, operationalUsers } from "../src/db/auth-schema";
import { products, productPrices } from "../src/db/business-schema";
import { branchProducts } from "../src/db/branch-schema";
import { mediaAssets } from "../src/db/media-schema";
import { lookupProducts } from "../src/modules/sales/product-lookup";
import {
  cleanPhotos,
  uploadPhoto,
  readPhoto,
} from "../src/modules/media/service";
import type { PhotoStorage } from "../src/modules/media/storage";
import type { Actor } from "../src/lib/access";
import sharp from "sharp";
import { createSalesService } from "../src/modules/sales/service";
let ctx: Awaited<ReturnType<typeof createDataModelTestContext>>;
const actor: Actor = { id: "catalog-test", role: "admin" };
const input = {
  name: "Té",
  priceCounter: "0",
  pricePedidosYa: "",
  priceUberEats: "",
};
const stored = new Map<string, Buffer>();
const storage: PhotoStorage = {
  async put(k, v) {
    stored.set(k, v);
  },
  async get(k) {
    const v = stored.get(k);
    return v
      ? new ReadableStream({
          start(c) {
            c.enqueue(v);
            c.close();
          },
        })
      : null;
  },
  async delete(k) {
    stored.delete(k);
  },
};
let oldId: string;
beforeAll(async () => {
  ctx = await createDataModelTestContext({ legacyCatalog: true });
  oldId = randomUUID();
  await ctx.client.query(
    "insert into products(id,name) values($1,'Anterior')",
    [oldId],
  );
  await ctx.client.query(
    "insert into product_prices(product_id,channel,amount) values($1,'counter',12.34)",
    [oldId],
  );
  await ctx.client.exec(
    await readFile("drizzle/0009_product_catalog.sql", "utf8"),
  );
  await ctx.db
    .insert(user)
    .values({ id: actor.id, name: "Test", email: "catalog@example.test" });
  await ctx.db
    .insert(operationalUsers)
    .values({ userId: actor.id, role: "admin" });
}, 60000);
afterAll(async () => {
  await ctx?.close();
});
describe("catálogo extendido en base desechable", () => {
  it("rechaza venta directa de producto agotado antes de resolver stock", async () => {
    const p = await createCatalogService(ctx.db).createRecord(
      actor,
      "products",
      input,
    );
    await ctx.db.insert(branchProducts).values({
      branchId: ctx.mapping.initialBranch.id,
      productId: p.id,
      enabled: true,
      temporarilySoldOut: true,
    });
    await expect(
      createSalesService(ctx.db).create(
        { ...actor, branchId: ctx.mapping.initialBranch.id },
        {
          requestId: randomUUID(),
          origin: "counter",
          channel: "counter",
          fulfillment: "takeaway",
          lines: [
            {
              productId: p.id,
              quantity: 1,
              price: "0",
              expectedPrice: "0.00",
              expectedFulfillmentVersionId: randomUUID(),
            },
          ],
          payments: [],
        },
      ),
    ).rejects.toThrow("agotado");
  });
  it("migra sin inventar datos ni cambiar precios", async () => {
    const [p] = await ctx.db
      .select()
      .from(products)
      .where(eq(products.id, oldId));
    expect(p.categoryId).toBeNull();
    expect(p.description).toBeNull();
    expect(p.imageAssetId).toBeNull();
    expect(p.enabledCounter).toBe(true);
    const [price] = await ctx.db
      .select()
      .from(productPrices)
      .where(eq(productPrices.productId, oldId));
    expect(price.amount).toBe("12.34");
  });
  it("preserva campos nuevos al editar con contrato anterior y respeta archivo de categoría", async () => {
    const svc = createCatalogService(ctx.db);
    const cat = await svc.createRecord(actor, "categories", {
      name: "Bebidas",
      sortOrder: 1,
    });
    const p = await svc.createRecord(actor, "products", {
      ...input,
      categoryId: cat.id,
      description: "Frío",
      enabledPedidosYa: false,
      sortOrder: 2,
    });
    const updated = await svc.updateRecord(actor, "products", p.id, {
      ...input,
      revision: p.revision,
    });
    expect(updated.categoryId).toBe(cat.id);
    expect(updated.description).toBe("Frío");
    expect(updated.enabledPedidosYa).toBe(false);
    await svc.updateRecord(actor, "categories", cat.id, {
      revision: cat.revision,
      archived: true,
    });
    await expect(
      svc.createRecord(actor, "products", { ...input, categoryId: cat.id }),
    ).rejects.toThrow();
    await ctx.db.insert(branchProducts).values({
      branchId: ctx.mapping.initialBranch.id,
      productId: p.id,
      enabled: true,
    });
    const list = await ctx.db.transaction((tx) =>
      lookupProducts(
        tx,
        ctx.mapping.initialBranch.id,
        p.name,
        "counter",
        "none",
        0,
      ),
    );
    expect(list.rows.some((r) => r.id === p.id)).toBe(true);
  });
  it("filtra y pagina más de 30 productos y mantiene agotado local", async () => {
    const list = await ctx.db
      .insert(products)
      .values(
        Array.from({ length: 32 }, (_, i) => ({
          name: `Página ${String(i).padStart(2, "0")}`,
        })),
      )
      .returning();
    await ctx.db.insert(branchProducts).values(
      list.map((p, i) => ({
        branchId: ctx.mapping.initialBranch.id,
        productId: p.id,
        enabled: true,
        temporarilySoldOut: i === 0,
      })),
    );
    const page = await ctx.db.transaction((tx) =>
      lookupProducts(
        tx,
        ctx.mapping.initialBranch.id,
        "Página",
        "counter",
        "",
        30,
      ),
    );
    expect(page.total).toBe(32);
    expect(page.rows).toHaveLength(2);
    expect(page.rows[0].name).toBe("Página 30");
    const first = await ctx.db.transaction((tx) =>
      lookupProducts(
        tx,
        ctx.mapping.initialBranch.id,
        "Página",
        "counter",
        "",
        0,
      ),
    );
    expect(first.rows[0].temporarilySoldOut).toBe(true);
  });
  it("conserva foto anterior en conflictos y limpia sólo activos desvinculados viejos", async () => {
    const raw = await sharp({
      create: { width: 2, height: 2, channels: 3, background: "red" },
    })
      .png()
      .toBuffer();
    const photo = await uploadPhoto(ctx.db, actor, raw, storage);
    const svc = createCatalogService(ctx.db);
    const p = await svc.createRecord(actor, "products", {
      ...input,
      imageAssetId: photo.id,
    });
    expect(await readPhoto(ctx.db, actor, photo.id, storage)).not.toBeNull();
    await expect(
      svc.updateRecord(actor, "products", p.id, {
        ...input,
        revision: 99,
        imageAssetId: null,
      }),
    ).rejects.toThrow();
    expect(
      (await ctx.db.select().from(products).where(eq(products.id, p.id)))[0]
        .imageAssetId,
    ).toBe(photo.id);
    await expect(
      svc.createRecord(actor, "products", { ...input, imageAssetId: photo.id }),
    ).rejects.toThrow();
    await svc.updateRecord(actor, "products", p.id, {
      ...input,
      revision: p.revision,
      imageAssetId: null,
    });
    expect(await cleanPhotos(ctx.db, storage, true)).toHaveLength(0);
    await ctx.db
      .update(mediaAssets)
      .set({ detachedAt: new Date("2020-01-01") })
      .where(eq(mediaAssets.id, photo.id));
    expect(await cleanPhotos(ctx.db, storage)).toHaveLength(1);
    expect(stored.size).toBe(1);
    expect(await cleanPhotos(ctx.db, storage, true)).toHaveLength(1);
    expect(stored.size).toBe(0);
  });
  it("rechaza fotos y cambios de catálogo de personal sin permiso", async () => {
    const staff: Actor = { id: "staff-test", role: "staff" };
    await ctx.db
      .insert(user)
      .values({ id: staff.id, name: "Staff", email: "staff@example.test" });
    await ctx.db
      .insert(operationalUsers)
      .values({ userId: staff.id, role: "staff" });
    await expect(
      createCatalogService(ctx.db).createRecord(staff, "categories", {
        name: "Prohibido",
      }),
    ).rejects.toThrow();
    await expect(
      uploadPhoto(ctx.db, staff, Buffer.from("x"), storage),
    ).rejects.toThrow();
  });
});
