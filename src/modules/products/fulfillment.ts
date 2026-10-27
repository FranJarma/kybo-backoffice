import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { Tx } from "@/db/types";
import {
  productFulfillments,
  productFulfillmentVersions,
} from "@/db/product-fulfillment-schema";
import { products } from "@/db/business-schema";
import { items } from "@/db/item-schema";
import { recipeVersions, recipes } from "@/db/recipe-schema";
import { branchProducts } from "@/db/branch-schema";
import { requireCatalogManagement } from "../branches/context";
import { loadConfiguration } from "../recipes/configuration";
import { resolveComposition } from "../recipes/composition";
import type { OperationalContext } from "../operations/types";
import type { Selection, ResolvedComposition } from "../modifiers/types";
import type { SaleChannel } from "../sales/types";
import { convertToBase } from "../items/units";
import {
  integer,
  safeQuantity,
  exactDivision,
  SCALE,
} from "../inventory/decimal";
import { AppError } from "@/lib/errors";
const fail = (message: string): never => {
  throw new AppError("FULFILLMENT_CONFLICT", message, 409);
};
const schema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("direct"),
      itemId: z.uuid(),
      quantity: z.string(),
      expectedVersion: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      mode: z.literal("recipe"),
      recipeVersionId: z.uuid(),
      expectedVersion: z.number().int().nonnegative(),
    })
    .strict(),
]);
export async function publishFulfillment(
  tx: Tx,
  ctx: Pick<OperationalContext, "actorId" | "role">,
  productId: string,
  raw: unknown,
) {
  await requireCatalogManagement(tx, { id: ctx.actorId, role: ctx.role });
  const input = schema.parse(raw);
  const [product] = await tx
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .for("update");
  if (!product || product.archivedAt) fail("El producto no está activo.");
  if (product.kind === "combo")
    fail("La preparación se configura en cada componente del combo.");
  const [current] = await tx
    .select({ version: productFulfillmentVersions.version })
    .from(productFulfillments)
    .innerJoin(
      productFulfillmentVersions,
      eq(productFulfillments.versionId, productFulfillmentVersions.id),
    )
    .where(eq(productFulfillments.productId, productId));
  if ((current?.version ?? 0) !== input.expectedVersion)
    fail("Cambió la configuración del producto.");
  if (input.mode === "direct") {
    const [item] = await tx
      .select()
      .from(items)
      .where(eq(items.id, input.itemId))
      .for("share");
    if (
      !item ||
      item.archivedAt ||
      !item.stockTracked ||
      item.class === "unclassified"
    )
      fail("Elegí un artículo activo y clasificado.");
    if (integer(convertToBase(input.quantity, "unit", "unit")) <= 0n)
      fail("La cantidad debe ser positiva.");
  } else {
    const [recipe] = await tx
      .select({
        productId: recipes.productId,
        model: recipeVersions.compositionModel,
      })
      .from(recipeVersions)
      .innerJoin(recipes, eq(recipes.id, recipeVersions.recipeId))
      .where(eq(recipeVersions.id, input.recipeVersionId));
    if (
      !recipe ||
      recipe.productId !== productId ||
      recipe.model !== "configurable"
    )
      fail("La receta debe ser configurable y pertenecer al producto.");
  }
  const [version] = await tx
    .insert(productFulfillmentVersions)
    .values({
      productId,
      version: input.expectedVersion + 1,
      mode: input.mode,
      itemId: input.mode === "direct" ? input.itemId : null,
      quantity:
        input.mode === "direct"
          ? convertToBase(input.quantity, "unit", "unit")
          : null,
      recipeVersionId: input.mode === "recipe" ? input.recipeVersionId : null,
    })
    .returning();
  await tx
    .insert(productFulfillments)
    .values({ productId, versionId: version.id })
    .onConflictDoUpdate({
      target: productFulfillments.productId,
      set: { versionId: version.id },
    });
  return version;
}
export async function resolveFulfillment(
  tx: Tx,
  ctx: OperationalContext,
  input: {
    productId: string;
    quantity: string;
    expectedVersionId: string;
    selections: Selection[];
    channel?: SaleChannel;
  },
) {
  const [enabled] = await tx
    .select()
    .from(branchProducts)
    .where(
      and(
        eq(branchProducts.branchId, ctx.branchId),
        eq(branchProducts.productId, input.productId),
        eq(branchProducts.enabled, true),
      ),
    )
    .for("share");
  if (!enabled) fail("El producto no está habilitado en esta sucursal.");
  const [version] = await tx
    .select({ version: productFulfillmentVersions })
    .from(productFulfillments)
    .innerJoin(
      productFulfillmentVersions,
      eq(productFulfillmentVersions.id, productFulfillments.versionId),
    )
    .where(eq(productFulfillments.productId, input.productId));
  return resolveFulfillmentComposition(tx, version?.version, input);
}

/** The caller holds the product and branch-product SHARE locks for this catalog version. */
export async function resolveFulfillmentComposition(
  tx: Tx,
  version: typeof productFulfillmentVersions.$inferSelect | undefined | null,
  input: {
    productId: string;
    quantity: string;
    expectedVersionId: string;
    selections: Selection[];
    channel?: SaleChannel;
  },
) {
  if (
    !version ||
    version.productId !== input.productId ||
    version.id !== input.expectedVersionId
  )
    return fail("Cambió la configuración del producto. Actualizá el pedido.");
  const quantity = integer(convertToBase(input.quantity, "unit", "unit"));
  if (quantity <= 0n) fail("Cantidad inválida.");
  let components: { itemId: string; quantity: string }[];
  let composition: ResolvedComposition = {
    components: [],
    modifiers: [],
    surcharge: "0.00",
  };
  if (version.mode === "direct") {
    if (input.selections.length)
      fail("La venta directa no admite modificadores.");
    components = [
      {
        itemId: version.itemId!,
        quantity: safeQuantity(
          exactDivision(integer(version.quantity!) * quantity, SCALE),
        ),
      },
    ];
  } else {
    const config = await loadConfiguration(tx, version.recipeVersionId!);
    if (config.model !== "configurable")
      fail("Convertí la receta anterior antes de habilitar su inventario.");
    composition = resolveComposition(config, input.selections, input.channel);
    components = composition.components.map((c) => ({
      itemId: c.itemId,
      quantity: safeQuantity(
        exactDivision(integer(c.quantity) * quantity, SCALE),
      ),
    }));
  }
  const componentItems = components.length
    ? await tx
        .select()
        .from(items)
        .where(
          inArray(
            items.id,
            components.map((c) => c.itemId),
          ),
        )
        .orderBy(asc(items.id))
        .for("share")
    : [];
  for (const c of components) {
    const item = componentItems.find((i) => i.id === c.itemId);
    const snapshot = composition.components.find((i) => i.itemId === c.itemId);
    if (
      !item ||
      item.archivedAt ||
      item.class === "unclassified" ||
      (version.mode === "recipe" &&
        (!item.recipeUsable || snapshot?.baseUnit !== item.baseUnit))
    )
      return fail("La composición incluye un artículo no habilitado.");
    if (version.mode === "direct")
      composition.components.push({
        ...c,
        name: item.name,
        baseUnit: item.baseUnit,
        archived: false,
      });
  }
  return { version, components, composition };
}
