import { and, eq, isNull, asc } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import type { Actor } from "@/lib/access";
import { AppError } from "@/lib/errors";
import { products, items, auditEvents } from "@/db/business-schema";
import { branches, branchProducts, locations } from "@/db/branch-schema";
import {
  productFulfillments,
  productFulfillmentVersions,
} from "@/db/product-fulfillment-schema";
import {
  preparationStations,
  preparationRoutes,
} from "@/db/preparation-schema";
import { recipes, recipeGraphLock } from "@/db/recipe-schema";
import {
  requireCatalogManagement,
  requireOperationalContext,
} from "../branches/context";
import { publishFulfillment } from "./fulfillment";
import { suggestItemCode } from "../items/code";
import type { ProductSetup } from "../catalog/validation";
const invalid = (message: string): never => {
  throw new AppError("VALIDATION", message, 400);
};
const conflict = (message: string): never => {
  throw new AppError("CONFLICT", message, 409);
};
export async function lockProductSetup(tx: Tx) {
  await tx.insert(recipeGraphLock).values({ id: 1 }).onConflictDoNothing();
  await tx
    .select()
    .from(recipeGraphLock)
    .where(eq(recipeGraphLock.id, 1))
    .for("update");
}
export async function applyProductSetup(
  tx: Tx,
  actor: Actor,
  productId: string,
  input: ProductSetup,
) {
  const ctx = await requireOperationalContext(tx, actor, actor.branchId ?? "");
  if (ctx.role === "staff")
    throw new AppError("FORBIDDEN", "Se requiere permiso de encargado.", 403);
  if (ctx.branchId !== input.branchId)
    conflict(
      "Cambió la sucursal seleccionada. Cerrá y volvé a abrir la ficha.",
    );
  const [product] = await tx
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .for("update");
  if (!product || product.archivedAt) invalid("Elegí un producto activo.");
  if ((product.kind === "combo") !== (input.mode === "combo"))
    invalid("El tipo y la configuración del producto no coinciden.");
  const [current] = await tx
    .select()
    .from(branchProducts)
    .where(
      and(
        eq(branchProducts.productId, productId),
        eq(branchProducts.branchId, ctx.branchId),
      ),
    )
    .for("update");
  if ((current?.revision ?? 0) !== input.branchRevision)
    conflict("Cambió la configuración de la sucursal. Volvé a abrir la ficha.");
  let dispatchLocationId = current?.dispatchLocationId ?? null;
  if (input.mode === "direct") {
    const [location] = await tx
      .select()
      .from(locations)
      .where(
        and(
          eq(locations.id, input.dispatchLocationId),
          eq(locations.branchId, ctx.branchId),
          isNull(locations.archivedAt),
        ),
      )
      .for("share");
    if (!location)
      invalid("Elegí una ubicación de stock activa de esta sucursal.");
    dispatchLocationId = location.id;
    const [physical] = await tx
      .select({ version: productFulfillmentVersions })
      .from(productFulfillments)
      .innerJoin(
        productFulfillmentVersions,
        eq(productFulfillments.versionId, productFulfillmentVersions.id),
      )
      .where(eq(productFulfillments.productId, productId));
    if ((physical?.version.version ?? 0) !== input.expectedVersion)
      conflict("Cambió el artículo vinculado. Volvé a abrir la ficha.");
    const [recipe] = await tx
      .select({ id: recipes.id })
      .from(recipes)
      .where(eq(recipes.productId, productId))
      .limit(1);
    if (
      (physical && physical.version.mode !== "direct") ||
      (!physical && recipe)
    )
      invalid(
        "Este producto ya tiene una receta. Conservá su modalidad de preparación.",
      );
    let itemId: string;
    if ("itemId" in input.source) {
      const [item] = await tx
        .select()
        .from(items)
        .where(eq(items.id, input.source.itemId))
        .for("share");
      if (
        !item ||
        item.archivedAt ||
        !item.stockTracked ||
        item.baseUnit !== "unit" ||
        !["food", "beverage", "packaging", "other"].includes(item.class)
      )
        invalid(
          "Elegí un artículo activo, controlado por unidad, para venderlo listo.",
        );
      itemId = item.id;
    } else {
      const item = input.source.newItem;
      const code =
        suggestItemCode(item.name) ||
        `ITEM-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
      const [created] = await tx
        .insert(items)
        .values({
          ...item,
          code,
          baseUnit: "unit",
          stockTracked: true,
          purchasable: true,
          recipeUsable: false,
        })
        .onConflictDoNothing()
        .returning();
      if (!created)
        conflict(
          "Ya existe un artículo con ese código. Elegí el artículo existente o usá otro nombre.",
        );
      itemId = created.id;
      await tx
        .insert(auditEvents)
        .values({
          actorId: actor.id,
          entity: "items",
          recordId: itemId,
          action: "create",
          after: created,
        });
    }
    if (
      !physical ||
      physical.version.itemId !== itemId ||
      physical.version.quantity !== input.quantity
    ) {
      const version = await publishFulfillment(tx, ctx, productId, {
        mode: "direct",
        itemId,
        quantity: input.quantity!,
        expectedVersion: input.expectedVersion,
      });
      await tx
        .insert(auditEvents)
        .values({
          actorId: actor.id,
          entity: "product-fulfillment",
          recordId: productId,
          action: "publish",
          before: physical?.version ?? null,
          after: version,
        });
    }
  } else if (input.mode === "recipe") {
    const [physical] = await tx
      .select({ mode: productFulfillmentVersions.mode })
      .from(productFulfillments)
      .innerJoin(
        productFulfillmentVersions,
        eq(productFulfillments.versionId, productFulfillmentVersions.id),
      )
      .where(eq(productFulfillments.productId, productId));
    if (physical?.mode === "direct")
      invalid(
        "Este producto se vende listo. Conservá su vínculo de inventario.",
      );
    const [station] = await tx
      .select({ id: preparationStations.id })
      .from(preparationStations)
      .innerJoin(
        locations,
        and(
          eq(locations.id, preparationStations.consumptionLocationId),
          eq(locations.branchId, ctx.branchId),
          isNull(locations.archivedAt),
        ),
      )
      .where(
        and(
          eq(preparationStations.id, input.stationId),
          eq(preparationStations.branchId, ctx.branchId),
          isNull(preparationStations.archivedAt),
        ),
      )
      .for("share");
    if (!station)
      invalid(
        "Elegí una estación activa de esta sucursal, con ubicación de consumo.",
      );
    const [route] = await tx
      .select()
      .from(preparationRoutes)
      .where(
        and(
          eq(preparationRoutes.productId, productId),
          eq(preparationRoutes.branchId, ctx.branchId),
        ),
      )
      .for("update");
    if ((route?.revision ?? 0) !== input.preparationRevision)
      conflict("Cambió la estación del producto. Volvé a abrir la ficha.");
    if (route?.stationId !== station.id) {
      const [after] = await tx
        .insert(preparationRoutes)
        .values({
          branchId: ctx.branchId,
          productId,
          stationId: station.id,
          revision: (route?.revision ?? 0) + 1,
        })
        .onConflictDoUpdate({
          target: [preparationRoutes.branchId, preparationRoutes.productId],
          set: { stationId: station.id, revision: (route?.revision ?? 0) + 1 },
        })
        .returning();
      await tx
        .insert(auditEvents)
        .values({
          actorId: actor.id,
          entity: "preparation-routes",
          recordId: productId,
          action: "route",
          before: route ?? null,
          after,
        });
    }
  }
  if (
    !current ||
    current.enabled !== input.enabled ||
    current.dispatchLocationId !== dispatchLocationId
  ) {
    const values = {
      enabled: input.enabled,
      dispatchLocationId,
      revision: (current?.revision ?? 0) + 1,
    };
    const [after] = await tx
      .insert(branchProducts)
      .values({ branchId: ctx.branchId, productId, ...values })
      .onConflictDoUpdate({
        target: [branchProducts.branchId, branchProducts.productId],
        set: values,
      })
      .returning();
    await tx
      .insert(auditEvents)
      .values({
        actorId: actor.id,
        entity: "branch-products",
        recordId: productId,
        action: "update",
        before: current ?? null,
        after,
      });
  }
}
export async function productSetupOptions(
  db: AppDb,
  actor: Actor,
  productId?: string,
) {
  await requireCatalogManagement(db, actor);
  const ctx = await requireOperationalContext(db, actor, actor.branchId ?? "");
  if (ctx.role === "staff")
    throw new AppError("FORBIDDEN", "Se requiere permiso de encargado.", 403);
  return db.transaction(
    async (tx) => {
      const [branch] = await tx
        .select({ id: branches.id, name: branches.name })
        .from(branches)
        .where(eq(branches.id, ctx.branchId));
      const locationRows = await tx
        .select({ id: locations.id, name: locations.name })
        .from(locations)
        .where(
          and(
            eq(locations.branchId, ctx.branchId),
            isNull(locations.archivedAt),
          ),
        )
        .orderBy(asc(locations.name));
      const stationRows = await tx
        .select({
          id: preparationStations.id,
          name: preparationStations.name,
          locationId: preparationStations.consumptionLocationId,
        })
        .from(preparationStations)
        .innerJoin(
          locations,
          and(
            eq(locations.id, preparationStations.consumptionLocationId),
            isNull(locations.archivedAt),
          ),
        )
        .where(
          and(
            eq(preparationStations.branchId, ctx.branchId),
            isNull(preparationStations.archivedAt),
          ),
        )
        .orderBy(asc(preparationStations.name));
      if (!productId)
        return {
          branch,
          locations: locationRows,
          stations: stationRows,
          current: null,
        };
      const [product] = await tx
        .select()
        .from(products)
        .where(eq(products.id, productId));
      if (!product || product.archivedAt)
        invalid("El producto no está activo.");
      const [local] = await tx
        .select()
        .from(branchProducts)
        .where(
          and(
            eq(branchProducts.productId, productId),
            eq(branchProducts.branchId, ctx.branchId),
          ),
        );
      const [physical] = await tx
        .select({ v: productFulfillmentVersions, itemName: items.name })
        .from(productFulfillments)
        .innerJoin(
          productFulfillmentVersions,
          eq(productFulfillments.versionId, productFulfillmentVersions.id),
        )
        .leftJoin(items, eq(items.id, productFulfillmentVersions.itemId))
        .where(eq(productFulfillments.productId, productId));
      const [recipe] = await tx
        .select({ id: recipes.id })
        .from(recipes)
        .where(eq(recipes.productId, productId))
        .limit(1);
      const [route] = await tx
        .select()
        .from(preparationRoutes)
        .where(
          and(
            eq(preparationRoutes.productId, productId),
            eq(preparationRoutes.branchId, ctx.branchId),
          ),
        );
      return {
        branch,
        locations: locationRows,
        stations: stationRows,
        current: {
          mode:
            product.kind === "combo" ? "combo" : (physical?.v.mode ?? "recipe"),
          modeLocked: product.kind === "combo" || !!physical || !!recipe,
          expectedVersion: physical?.v.version ?? 0,
          itemId: physical?.v.itemId ?? "",
          itemName: physical?.itemName ?? "",
          quantity: physical?.v.quantity ?? "1.000000",
          branchRevision: local?.revision ?? 0,
          enabled: local?.enabled ?? true,
          dispatchLocationId: local?.dispatchLocationId ?? "",
          stationId: route?.stationId ?? "",
          preparationRevision: route?.revision ?? 0,
        },
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
