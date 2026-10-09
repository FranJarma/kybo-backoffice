import { and, eq, isNull } from "drizzle-orm";
import { productCategories } from "@/db/business-schema";
import { mediaAssets } from "@/db/media-schema";
import type { Tx } from "@/modules/inventory/service";
import { AppError } from "@/lib/errors";
export function productFields(values: Record<string, unknown>) {
  const {
    priceCounter: _a,
    pricePedidosYa: _b,
    priceUberEats: _c,
    ...fields
  } = values;
  void _a;
  void _b;
  void _c;
  return fields as { name: string };
}
export async function checkProductCategory(
  tx: Tx,
  values: Record<string, unknown>,
  previous?: Record<string, unknown>,
) {
  if (!values.categoryId) return;
  const [category] = await tx
    .select()
    .from(productCategories)
    .where(eq(productCategories.id, String(values.categoryId)))
    .for("share");
  if (
    !category ||
    (category.archivedAt && previous?.categoryId !== category.id)
  )
    throw new AppError(
      "CATEGORY_UNAVAILABLE",
      "Elegí una categoría activa o Sin categoría.",
      409,
    );
}
export async function bindProductImage(
  tx: Tx,
  actorId: string,
  productId: string,
  values: Record<string, unknown>,
  previous?: Record<string, unknown>,
) {
  if (
    !("imageAssetId" in values) ||
    values.imageAssetId === previous?.imageAssetId
  )
    return;
  const id = values.imageAssetId;
  if (id) {
    const [asset] = await tx
      .select()
      .from(mediaAssets)
      .where(eq(mediaAssets.id, String(id)))
      .for("update");
    if (
      !asset ||
      asset.deletingAt ||
      (asset.claimedProductId
        ? asset.claimedProductId !== productId
        : asset.creatorId !== actorId)
    )
      throw new AppError(
        "IMAGE_UNAVAILABLE",
        "La foto ya no está disponible. Volvé a cargarla.",
        409,
      );
    await tx
      .update(mediaAssets)
      .set({ claimedProductId: productId, detachedAt: null })
      .where(eq(mediaAssets.id, asset.id));
  }
  if (previous?.imageAssetId) {
    await tx
      .update(mediaAssets)
      .set({ detachedAt: new Date() })
      .where(
        and(
          eq(mediaAssets.id, String(previous.imageAssetId)),
          isNull(mediaAssets.deletingAt),
        ),
      );
  }
}
