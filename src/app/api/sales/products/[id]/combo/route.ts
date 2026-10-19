import { and, eq, inArray } from "drizzle-orm";
import { getDb } from "@/db/client";
import { products, productPrices } from "@/db/business-schema";
import { branchProducts } from "@/db/branch-schema";
import { loadCombo } from "@/modules/combos/service";
import { salesResponse } from "@/modules/sales/http";
import { canSellProduct } from "@/modules/products/availability";
import { channelSchema } from "@/modules/sales/validation";
import { invalid } from "@/modules/inventory/service";
import { priceWithVat } from "@/modules/pricing/amounts";
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return salesResponse(null, async (actor) => {
    const { id } = await context.params,
      db = await getDb();
    const channel = channelSchema.parse(
      new URL(request.url).searchParams.get("channel") ?? "counter",
    );
    const [p] = await db.select().from(products).where(eq(products.id, id));
    const [local] = await db
      .select()
      .from(branchProducts)
      .where(
        and(
          eq(branchProducts.productId, id),
          eq(branchProducts.branchId, actor.branchId!),
        ),
      );
    if (!p || p.kind !== "combo" || !canSellProduct(p, local, channel))
      invalid("Combo no disponible.");
    if (p.vatRate === null)
      invalid("Configurá el IVA del combo antes de venderlo.");
    const definition = await loadCombo(db, id);
    if (!definition)
      return invalid("Publicá los componentes del combo antes de venderlo.");
    const [price] = await db
      .select()
      .from(productPrices)
      .where(
        and(
          eq(productPrices.productId, id),
          eq(productPrices.channel, channel),
        ),
      );
    if (!price) invalid("El combo no tiene precio en este canal.");
    const ids = [
      ...new Set(
        definition.groups.flatMap((g) => g.options.map((o) => o.productId)),
      ),
    ];
    const children = await db
      .select({ product: products, local: branchProducts })
      .from(products)
      .leftJoin(
        branchProducts,
        and(
          eq(branchProducts.productId, products.id),
          eq(branchProducts.branchId, actor.branchId!),
        ),
      )
      .where(inArray(products.id, ids));
    const unavailableProductIds = children
      .filter((c) => !canSellProduct(c.product, c.local ?? undefined, channel))
      .map((c) => c.product.id);
    return {
      definition,
      basePrice: priceWithVat(price.amount, p.vatRate),
      netBasePrice: price.amount,
      vatRate: p.vatRate,
      pricingRevision: p.revision,
      unavailableProductIds,
    };
  });
}
