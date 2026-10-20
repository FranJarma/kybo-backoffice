import { beforeAll, afterAll, expect, it, vi } from "vitest";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../src/db/schema";
import type { AppDb } from "../src/db/client";
import { user } from "../src/db/auth-schema";
import { mediaAssets } from "../src/db/media-schema";
import { products } from "../src/db/business-schema";
import { readPhoto } from "../src/modules/media/service";
import { createPhotoCache } from "../src/modules/media/photo-cache";
import type { PhotoStorage } from "../src/modules/media/storage";
import { createDataModelTestContext } from "./helpers/data-model-database";

let ctx: Awaited<ReturnType<typeof createDataModelTestContext>>;
let data: Buffer;
const owner = { id: "photo-owner", role: "admin" as const };
const employee = { id: "photo-employee", role: "staff" as const };
beforeAll(async () => {
  ctx = await createDataModelTestContext();
  await ctx.db
    .insert(user)
    .values({ id: owner.id, name: "Owner", email: "photos@test.invalid" });
  data = await sharp({
    create: { width: 1440, height: 960, channels: 3, background: "#ffa920" },
  })
    .webp()
    .toBuffer();
});
afterAll(async () => {
  await ctx?.close();
});

async function fixture() {
  const id = randomUUID();
  await ctx.db.insert(mediaAssets).values({
    id,
    provider: "fixture",
    storageKey: `${id}.webp`,
    creatorId: owner.id,
    contentType: "image/webp",
    width: 1440,
    height: 960,
    bytes: data.length,
  });
  const storage: PhotoStorage = {
    put: vi.fn(),
    delete: vi.fn(),
    get: vi.fn(async () => new Response(new Uint8Array(data)).body),
  };
  return { id, storage, cache: createPhotoCache() };
}

it("checks photo ownership and product linkage in a single database read", async () => {
  const { id, storage, cache } = await fixture();
  let reads = 0;
  const db = drizzle(ctx.client, {
    schema,
    logger: {
      logQuery(query) {
        if (/^select\b/i.test(query)) reads++;
      },
    },
  }) as unknown as AppDb;
  await readPhoto(db, owner, id, storage, "thumbnail", cache);
  expect(reads).toBe(1);
});

it("serves small thumbnails and detailed previews while reading the original only once", async () => {
  const { id, storage, cache } = await fixture();
  const thumbnail = Buffer.from(
    await new Response(
      await readPhoto(ctx.db, owner, id, storage, "thumbnail", cache),
    ).arrayBuffer(),
  );
  const preview = Buffer.from(
    await new Response(
      await readPhoto(ctx.db, owner, id, storage, "preview", cache),
    ).arrayBuffer(),
  );
  expect((await sharp(thumbnail).metadata()).width).toBe(128);
  expect((await sharp(preview).metadata()).width).toBe(384);
  expect(thumbnail.length).toBeLessThan(data.length / 4);
  const again = Buffer.from(
    await new Response(
      await readPhoto(ctx.db, owner, id, storage, "thumbnail", cache),
    ).arrayBuffer(),
  );
  expect(again).toEqual(thumbnail);
  expect(storage.get).toHaveBeenCalledTimes(1);
  const original = Buffer.from(
    await new Response(
      await readPhoto(ctx.db, owner, id, storage, "original", cache),
    ).arrayBuffer(),
  );
  expect(original).toEqual(data);
});

it("rechecks access even when a creator's preview is in memory", async () => {
  const { id, storage, cache } = await fixture();
  await readPhoto(ctx.db, owner, id, storage, "thumbnail", cache);
  await expect(
    readPhoto(ctx.db, employee, id, storage, "thumbnail", cache),
  ).rejects.toMatchObject({ status: 404 });
  const [product] = await ctx.db
    .insert(products)
    .values({ name: "Shared product", imageAssetId: id })
    .returning();
  expect(
    await readPhoto(ctx.db, employee, id, storage, "thumbnail", cache),
  ).not.toBeNull();
  expect(storage.get).toHaveBeenCalledTimes(1);
  await ctx.db
    .update(products)
    .set({ imageAssetId: null })
    .where(eq(products.id, product.id));
  await expect(
    readPhoto(ctx.db, employee, id, storage, "thumbnail", cache),
  ).rejects.toMatchObject({ status: 404 });
  await ctx.db
    .update(mediaAssets)
    .set({ deletingAt: new Date() })
    .where(eq(mediaAssets.id, id));
  await expect(
    readPhoto(ctx.db, owner, id, storage, "thumbnail", cache),
  ).rejects.toMatchObject({ status: 404 });
});

it("does not enlarge small originals or mix replacement photos", async () => {
  const { id, storage, cache } = await fixture();
  const small = await sharp({
    create: { width: 30, height: 20, channels: 3, background: "#88ccff" },
  })
    .webp()
    .toBuffer();
  vi.mocked(storage.get).mockImplementation(
    async () => new Response(new Uint8Array(small)).body,
  );
  const first = Buffer.from(
    await new Response(
      await readPhoto(ctx.db, owner, id, storage, "thumbnail", cache),
    ).arrayBuffer(),
  );
  expect((await sharp(first).metadata()).width).toBe(30);
  const second = await fixture();
  const replacement = Buffer.from(
    await new Response(
      await readPhoto(
        ctx.db,
        owner,
        second.id,
        second.storage,
        "thumbnail",
        cache,
      ),
    ).arrayBuffer(),
  );
  expect(replacement).not.toEqual(first);
  expect((await sharp(replacement).metadata()).width).toBe(128);
});
