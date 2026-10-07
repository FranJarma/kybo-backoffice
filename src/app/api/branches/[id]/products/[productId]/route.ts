import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db/client";
import { branchProducts, locations } from "@/db/branch-schema";
import { products } from "@/db/business-schema";
import { productFulfillments } from "@/db/product-fulfillment-schema";
import { requireActor } from "@/lib/auth";
import { requireOperationalContext } from "@/modules/branches/context";
import {
  privateJson,
  errorResponse,
  requestInput,
} from "@/modules/catalog/http";
import { AppError } from "@/lib/errors";
type Params = { params: Promise<{ id: string; productId: string }> };
export async function GET(request: Request, { params }: Params) {
  try {
    const { id, productId } = await params,
      db = await getDb();
    const ctx = await requireOperationalContext(db, await requireActor(), id);
    if (ctx.role === "staff")
      throw new AppError("FORBIDDEN", "Se requiere permiso de encargado.", 403);
    const [row] = await db
      .select()
      .from(branchProducts)
      .where(
        and(
          eq(branchProducts.branchId, id),
          eq(branchProducts.productId, z.uuid().parse(productId)),
        ),
      );
    return privateJson(row ?? { enabled: false, dispatchLocationId: null });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function PUT(request: Request, { params }: Params) {
  try {
    const actor = await requireActor(),
      { id, productId } = await params;
    z.uuid().parse(productId);
    const input = z
      .object({ enabled: z.boolean(), dispatchLocationId: z.uuid().nullable() })
      .strict()
      .parse(await requestInput(request));
    const db = await getDb();
    return privateJson(
      await db.transaction(async (tx) => {
        const ctx = await requireOperationalContext(tx, actor, id);
        if (ctx.role === "staff")
          throw new AppError(
            "FORBIDDEN",
            "Se requiere permiso de encargado.",
            403,
          );
        const [product] = await tx
          .select()
          .from(products)
          .where(and(eq(products.id, productId), isNull(products.archivedAt)))
          .for("share");
        const [fulfillment] = await tx
          .select()
          .from(productFulfillments)
          .where(eq(productFulfillments.productId, productId));
        if (!product || (input.enabled && !fulfillment))
          throw new AppError(
            "PRODUCT_UNCONFIGURED",
            "Configurá primero la receta o el artículo de reventa del producto.",
            409,
          );
        if (input.dispatchLocationId) {
          const [location] = await tx
            .select()
            .from(locations)
            .where(
              and(
                eq(locations.id, input.dispatchLocationId),
                eq(locations.branchId, id),
                isNull(locations.archivedAt),
              ),
            )
            .for("share");
          if (!location)
            throw new AppError(
              "VALIDATION",
              "Elegí una ubicación activa de esta sucursal.",
              400,
            );
        }
        const [row] = await tx
          .insert(branchProducts)
          .values({ branchId: id, productId, ...input })
          .onConflictDoUpdate({
            target: [branchProducts.branchId, branchProducts.productId],
            set: input,
          })
          .returning();
        return row;
      }),
    );
  } catch (error) {
    return errorResponse(error);
  }
}
