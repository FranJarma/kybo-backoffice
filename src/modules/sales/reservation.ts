import { randomUUID } from "node:crypto";
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
import { reserveStockBatch } from "../inventory/reservation-batch";
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
  const rows = await tx
    .select({
      line: saleLines,
      component: saleLineComponents,
      version: productFulfillmentVersions,
      enabled: branchProducts,
      recipeLocationId: preparationStations.consumptionLocationId,
    })
    .from(saleOrders)
    .innerJoin(saleLines, eq(saleLines.orderId, saleOrders.id))
    .leftJoin(
      saleLineComponents,
      eq(saleLineComponents.saleLineId, saleLines.id),
    )
    .leftJoin(
      productFulfillmentVersions,
      and(
        eq(productFulfillmentVersions.id, saleLines.fulfillmentVersionId),
        eq(productFulfillmentVersions.productId, saleLines.productId),
      ),
    )
    .leftJoin(
      branchProducts,
      and(
        eq(branchProducts.branchId, ctx.branchId),
        eq(branchProducts.productId, saleLines.productId),
        eq(branchProducts.enabled, true),
      ),
    )
    .leftJoin(
      preparationRoutes,
      and(
        eq(preparationRoutes.productId, saleLines.productId),
        eq(preparationRoutes.branchId, ctx.branchId),
      ),
    )
    .leftJoin(
      preparationStations,
      and(
        eq(preparationStations.id, preparationRoutes.stationId),
        eq(preparationStations.branchId, ctx.branchId),
      ),
    )
    .where(
      and(eq(saleOrders.id, orderId), eq(saleOrders.branchId, ctx.branchId)),
    )
    .orderBy(saleLines.id);
  if (!rows.length) fail("El pedido no pertenece a esta sucursal.");
  const lines = [...new Map(rows.map((r) => [r.line.id, r.line])).values()];
  const demandGroups = [];
  const physicalLines = lines.filter((l) => l.lineKind !== "combo");
  if (!physicalLines.length) return;
  for (const line of lines) {
    if (line.lineKind === "combo") continue;
    if (!line.fulfillmentVersionId)
      fail("El producto necesita una configuración física publicada.");
    const row = rows.find((r) => r.line.id === line.id)!;
    const { version, enabled } = row;
    if (!version || !enabled)
      fail("El producto no está habilitado en esta sucursal.");
    let locationId = enabled.dispatchLocationId;
    if (version.mode === "recipe") {
      locationId = row.recipeLocationId;
    }
    if (!locationId)
      fail("Configurá la ubicación de consumo o despacho del producto.");
    const components = rows
      .filter((r) => r.line.id === line.id)
      .flatMap((r) => (r.component ? [r.component] : []));
    if (!components.length) fail("El producto no tiene composición física.");
    const demands = components.map((c) => ({
      itemId: c.itemId,
      locationId,
      quantity: safeQuantity(integer(c.quantity) * BigInt(line.quantity)),
    }));
    demandGroups.push({ line, version, demands, documentId: randomUUID() });
  }
  await tx.insert(stockDocuments).values(
    demandGroups.map((g) => ({
      id: g.documentId,
      branchId: ctx.branchId,
      kind: "sale",
      saleLineId: g.line.id,
    })),
  );
  const reservations = await reserveStockBatch(
    tx,
    ctx,
    operationId,
    demandGroups,
  );
  await tx.insert(saleLineFulfillments).values(
    demandGroups.map(({ line, version, documentId }, position) => ({
      saleLineId: line.id,
      branchId: ctx.branchId,
      versionId: version.id,
      documentId,
      reservationId: reservations[position].reservationId,
      mode: version.mode,
      ordered: line.quantity,
    })),
  );
}
