import { and, eq } from "drizzle-orm";
import type { Tx } from "@/db/types";
import type { OperationalContext } from "../operations/types";
import { saleOrders, saleLines } from "@/db/sales-schema";
import { saleLineComponents } from "@/db/modifier-schema";
import { productFulfillmentVersions } from "@/db/product-fulfillment-schema";
import { branchProducts } from "@/db/branch-schema";
import {
  preparationRoutes,
  preparationStations,
} from "@/db/preparation-schema";
import { stockDocuments } from "@/db/inventory-document-schema";
import { saleLineFulfillments } from "@/db/fulfillment-event-schema";
import { reserveStock } from "../inventory/reservations";
import { lockStock } from "../inventory/locking";
import { integer, safeQuantity } from "../inventory/decimal";
import { AppError } from "@/lib/errors";
function fail(message: string): never {
  throw new AppError("RESERVATION_CONFLICT", message, 409);
}
export async function reserveOrder(
  tx: Tx,
  ctx: OperationalContext,
  orderId: string,
  operationId: string,
) {
  const [order] = await tx
    .select()
    .from(saleOrders)
    .where(
      and(eq(saleOrders.id, orderId), eq(saleOrders.branchId, ctx.branchId)),
    );
  if (!order) fail("El pedido no pertenece a esta sucursal.");
  const lines = await tx
    .select()
    .from(saleLines)
    .where(eq(saleLines.orderId, orderId))
    .orderBy(saleLines.id);
  const demandGroups = [];
  for (const line of lines) {
    if (!line.fulfillmentVersionId)
      fail("El producto necesita una configuración física publicada.");
    const [version] = await tx
      .select()
      .from(productFulfillmentVersions)
      .where(
        and(
          eq(productFulfillmentVersions.id, line.fulfillmentVersionId),
          eq(productFulfillmentVersions.productId, line.productId),
        ),
      );
    const [enabled] = await tx
      .select()
      .from(branchProducts)
      .where(
        and(
          eq(branchProducts.branchId, ctx.branchId),
          eq(branchProducts.productId, line.productId),
          eq(branchProducts.enabled, true),
        ),
      );
    if (!version || !enabled)
      fail("El producto no está habilitado en esta sucursal.");
    let locationId = enabled.dispatchLocationId;
    if (version.mode === "recipe") {
      const [route] = await tx
        .select({ locationId: preparationStations.consumptionLocationId })
        .from(preparationRoutes)
        .innerJoin(
          preparationStations,
          eq(preparationStations.id, preparationRoutes.stationId),
        )
        .where(
          and(
            eq(preparationRoutes.productId, line.productId),
            eq(preparationRoutes.branchId, ctx.branchId),
            eq(preparationStations.branchId, ctx.branchId),
          ),
        );
      locationId = route?.locationId ?? null;
    }
    if (!locationId)
      fail("Configurá la ubicación de consumo o despacho del producto.");
    const components = await tx
      .select()
      .from(saleLineComponents)
      .where(eq(saleLineComponents.saleLineId, line.id));
    if (!components.length) fail("El producto no tiene composición física.");
    const demands = components.map((c) => ({
      itemId: c.itemId,
      locationId,
      quantity: safeQuantity(integer(c.quantity) * BigInt(line.quantity)),
    }));
    demandGroups.push({ line, version, demands });
  }
  await lockStock(
    tx,
    ctx,
    demandGroups.flatMap((g) => g.demands),
  );
  for (const { line, version, demands } of demandGroups) {
    const [document] = await tx
      .insert(stockDocuments)
      .values({ branchId: ctx.branchId, kind: "sale", saleLineId: line.id })
      .returning();
    const reservation = await reserveStock(tx, ctx, {
      operationId,
      documentId: document.id,
      demands,
    });
    await tx
      .insert(saleLineFulfillments)
      .values({
        saleLineId: line.id,
        branchId: ctx.branchId,
        versionId: version.id,
        documentId: document.id,
        reservationId: reservation.reservationId,
        mode: version.mode,
        ordered: line.quantity,
      });
  }
}
