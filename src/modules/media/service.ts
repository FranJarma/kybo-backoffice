import { randomUUID } from "node:crypto";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { mediaAssets } from "@/db/media-schema";
import { products } from "@/db/business-schema";
import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";
import { requireCatalogManagement } from "@/modules/branches/context";
import { AppError } from "@/lib/errors";
import { normalizePhoto } from "./image";
import type { PhotoStorage } from "./storage";
export async function uploadPhoto(
  db: AppDb,
  actor: Actor,
  raw: Buffer,
  storage: PhotoStorage,
) {
  await requireCatalogManagement(db, actor);
  const image = await normalizePhoto(raw),
    id = randomUUID(),
    key = `products/${id}.webp`;
  await storage.put(key, image.data);
  try {
    await db
      .insert(mediaAssets)
      .values({
        id,
        provider: "vercel-blob",
        storageKey: key,
        creatorId: actor.id,
        contentType: "image/webp",
        width: image.width,
        height: image.height,
        bytes: image.data.length,
      });
  } catch (e) {
    try {
      await storage.delete(key);
    } catch {
      /* UUID key remains discoverable in provider inventory; never claim success. */
    }
    throw e;
  }
  return { id };
}
export async function readPhoto(
  db: AppDb,
  actor: Actor,
  id: string,
  storage: PhotoStorage,
) {
  const [asset] = await db
    .select()
    .from(mediaAssets)
    .where(and(eq(mediaAssets.id, id), isNull(mediaAssets.deletingAt)));
  if (!asset) throw new AppError("NOT_FOUND", "Foto no disponible.", 404);
  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.imageAssetId, id))
    .limit(1);
  if (!product && asset.creatorId !== actor.id)
    throw new AppError("NOT_FOUND", "Foto no disponible.", 404);
  return storage.get(asset.storageKey);
}
export async function cleanPhotos(
  db: AppDb,
  storage: PhotoStorage,
  apply = false,
  now = new Date(),
) {
  const cutoff = new Date(now.getTime() - 7 * 86400000);
  const candidates = await db
    .select()
    .from(mediaAssets)
    .where(
      or(
        and(
          isNull(mediaAssets.claimedProductId),
          lt(mediaAssets.createdAt, cutoff),
        ),
        lt(mediaAssets.detachedAt, cutoff),
      ),
    );
  const report = [];
  for (const candidate of candidates) {
    const eligible = await db.transaction(async (tx) => {
      const [asset] = await tx
        .select()
        .from(mediaAssets)
        .where(eq(mediaAssets.id, candidate.id))
        .for("update");
      if (
        !asset ||
        (asset.claimedProductId &&
          (!asset.detachedAt || asset.detachedAt >= cutoff))
      )
        return false;
      const [used] = await tx
        .select({ id: products.id })
        .from(products)
        .where(eq(products.imageAssetId, asset.id))
        .limit(1);
      if (used) return false;
      if (apply)
        await tx
          .update(mediaAssets)
          .set({ deletingAt: now })
          .where(eq(mediaAssets.id, asset.id));
      return true;
    });
    if (!eligible) continue;
    report.push({ id: candidate.id, action: apply ? "delete" : "candidate" });
    if (apply) {
      await storage.delete(candidate.storageKey);
      await db.delete(mediaAssets).where(eq(mediaAssets.id, candidate.id));
    }
  }
  return report;
}
