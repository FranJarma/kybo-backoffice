import { and, asc, count, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import {
  products,
  productPrices,
  productCategories,
} from "@/db/business-schema";
import { branchProducts } from "@/db/branch-schema";
import { productFulfillments } from "@/db/product-fulfillment-schema";
import type { Tx } from "@/modules/inventory/service";
export async function lookupProducts(
  tx: Tx,
  branchId: string,
  q: string,
  channel: string,
  category: string,
  offset: number,
) {
  z.union([z.literal(""), z.literal("none"), z.uuid()]).parse(category);
  z.number().int().min(0).max(1_000_000).parse(offset);
  const effectiveCategory = sql<
    string | null
  >`case when ${productCategories.archivedAt} is null then ${products.categoryId} else null end`;
  const filter = and(
    eq(branchProducts.branchId, branchId),
    eq(branchProducts.enabled, true),
    isNull(products.archivedAt),
    eq(
      channel === "counter"
        ? products.enabledCounter
        : channel === "pedidosya"
          ? products.enabledPedidosYa
          : products.enabledUberEats,
      true,
    ),
    or(
      ilike(products.name, `%${q.replace(/[\\%_]/g, "\\$&")}%`),
      sql`${products.id}::text = ${q}`,
    ),
    category === "none"
      ? sql`${effectiveCategory} is null`
      : category
        ? sql`${effectiveCategory} = ${category}::uuid`
        : undefined,
  );
  const [{ total }] = await tx
    .select({ total: count() })
    .from(products)
    .innerJoin(branchProducts, eq(branchProducts.productId, products.id))
    .leftJoin(productCategories, eq(productCategories.id, products.categoryId))
    .where(filter);
  const rows = await tx
    .select({
      id: products.id,
      name: products.name,
      description: products.description,
      imageAssetId: products.imageAssetId,
      categoryId: effectiveCategory,
      price: productPrices.amount,
      temporarilySoldOut: branchProducts.temporarilySoldOut,
      fulfillmentVersionId: productFulfillments.versionId,
    })
    .from(products)
    .innerJoin(branchProducts, eq(branchProducts.productId, products.id))
    .leftJoin(productCategories, eq(productCategories.id, products.categoryId))
    .leftJoin(
      productPrices,
      and(
        eq(productPrices.productId, products.id),
        eq(productPrices.channel, channel),
      ),
    )
    .leftJoin(
      productFulfillments,
      eq(productFulfillments.productId, products.id),
    )
    .where(filter)
    .orderBy(
      sql`case when ${effectiveCategory} is null then 1 else 0 end`,
      sql`case when ${effectiveCategory} is not null then ${productCategories.sortOrder} end`,
      sql`case when ${effectiveCategory} is not null then ${productCategories.name} end`,
      effectiveCategory,
      asc(products.sortOrder),
      asc(products.name),
      asc(products.id),
    )
    .limit(30)
    .offset(offset);
  const categories = await tx
    .select({ id: productCategories.id, name: productCategories.name })
    .from(productCategories)
    .where(isNull(productCategories.archivedAt))
    .orderBy(
      asc(productCategories.sortOrder),
      asc(productCategories.name),
      asc(productCategories.id),
    );
  return { rows, total, categories, offset };
}
