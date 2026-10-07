import {
  requireCatalogManagement,
  requireCatalogRead,
} from "../branches/context";
import {
  modifierOptionComponents,
  recipeModifierOptionComponents,
  saleLineComponents,
} from "@/db/modifier-schema";
import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";
import type { Entity, ListResult, CatalogRow } from "./types";
import { AppError } from "@/lib/errors";
import {
  and,
  eq,
  ilike,
  isNull,
  isNotNull,
  count,
  asc,
  inArray,
} from "drizzle-orm";
import {
  suppliers,
  customers,
  paymentMethods,
  items,
  products,
  productPrices,
  purchasePresentations,
  auditEvents,
} from "@/db/business-schema";
import { parseInput, parseUpdate } from "./validation";
import { recipes, recipeOptions } from "@/db/recipe-schema";
import { inventoryMovements } from "@/db/inventory-schema";
import { stockMovements } from "@/db/stock-movement-schema";
import { productFulfillmentVersions } from "@/db/product-fulfillment-schema";

const tables = {
  suppliers,
  customers,
  "payment-methods": paymentMethods,
  items,
  products,
  presentations: purchasePresentations,
};
type QueryDb = Pick<AppDb, "select" | "insert" | "update" | "delete">;
type DbRow = Record<string, unknown>;

function serialize(row: DbRow): CatalogRow {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key,
      value instanceof Date ? value.toISOString() : value,
    ]),
  ) as CatalogRow;
}

async function enrich(
  db: QueryDb,
  entity: Entity,
  rows: DbRow[],
): Promise<CatalogRow[]> {
  const result = rows.map(serialize);
  if (!result.length) return result;
  const ids = result.map((row) => row.id);
  if (entity === "products") {
    const prices = await db
      .select()
      .from(productPrices)
      .where(inArray(productPrices.productId, ids));
    return result.map((row) => ({
      ...row,
      priceCounter:
        prices.find((p) => p.productId === row.id && p.channel === "counter")
          ?.amount ?? null,
      pricePedidosYa:
        prices.find((p) => p.productId === row.id && p.channel === "pedidosya")
          ?.amount ?? null,
      priceUberEats:
        prices.find((p) => p.productId === row.id && p.channel === "ubereats")
          ?.amount ?? null,
    }));
  }
  if (entity === "presentations") {
    const references = await db
      .select({
        id: purchasePresentations.id,
        supplierName: suppliers.name,
        itemName: items.name,
        baseUnit: items.baseUnit,
      })
      .from(purchasePresentations)
      .innerJoin(suppliers, eq(suppliers.id, purchasePresentations.supplierId))
      .innerJoin(items, eq(items.id, purchasePresentations.itemId))
      .where(inArray(purchasePresentations.id, ids));
    return result.map((row) => ({
      ...row,
      ...references.find((ref) => ref.id === row.id),
    }));
  }
  return result;
}

async function checkReferences(db: QueryDb, input: DbRow, previous?: DbRow) {
  for (const [key, table] of [
    ["supplierId", suppliers],
    ["itemId", items],
  ] as const) {
    const id = input[key] as string;
    const [reference] = await db
      .select()
      .from(table)
      .where(eq(table.id, id))
      .for("update");
    if (!reference)
      throw new AppError(
        "NOT_FOUND",
        "El proveedor o insumo ya no existe.",
        404,
      );
    if (reference.archivedAt && previous?.[key] !== id)
      throw new AppError(
        "ARCHIVED_REFERENCE",
        "Elegí un proveedor y un insumo activos.",
        409,
      );
  }
}

async function writePrices(db: QueryDb, id: string, input: DbRow) {
  await db.delete(productPrices).where(eq(productPrices.productId, id));
  const channels = [
    ["priceCounter", "counter"],
    ["pricePedidosYa", "pedidosya"],
    ["priceUberEats", "ubereats"],
  ] as const;
  for (const [key, channel] of channels) {
    const amount = input[key] as string | null;
    if (amount !== null)
      await db.insert(productPrices).values({ productId: id, channel, amount });
  }
}

export function createCatalogService(db: AppDb) {
  return {
    async listRecords(
      actor: Actor,
      entity: Entity,
      search = "",
      archived = false,
    ): Promise<ListResult> {
      await requireCatalogRead(db, actor);
      const table = tables[entity];
      const query = search
        .trim()
        .slice(0, 160)
        .replace(/[\\%_]/g, "\\$&");
      const condition = and(
        archived ? isNotNull(table.archivedAt) : isNull(table.archivedAt),
        query ? ilike(table.name, `%${query}%`) : undefined,
      );
      const rows = await db
        .select()
        .from(table)
        .where(condition)
        .orderBy(asc(table.name), asc(table.id))
        .limit(100);
      const [total] = await db
        .select({ value: count() })
        .from(table)
        .where(condition);
      return { rows: await enrich(db, entity, rows), total: total.value };
    },
    async createRecord(
      actor: Actor,
      entity: Entity,
      input: unknown,
    ): Promise<CatalogRow> {
      await requireCatalogManagement(db, actor);
      const values = parseInput(entity, input);
      return db.transaction(async (tx) => {
        if (entity === "presentations") await checkReferences(tx, values);
        // Validation above whitelists the fields for this table, including required name.
        const inserted =
          entity === "products"
            ? { name: values.name as string }
            : (values as { name: string });
        const [row] = await tx
          .insert(tables[entity])
          .values(inserted)
          .returning();
        if (entity === "products") await writePrices(tx, row.id, values);
        const [after] = await enrich(tx, entity, [row]);
        await tx.insert(auditEvents).values({
          actorId: actor.id,
          entity,
          recordId: row.id,
          action: "create",
          after,
        });
        return after;
      });
    },
    async updateRecord(
      actor: Actor,
      entity: Entity,
      id: string,
      input: unknown,
    ): Promise<CatalogRow> {
      await requireCatalogManagement(db, actor);
      if (
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          id,
        )
      )
        throw new AppError("VALIDATION", "Identificador inválido.", 400);
      const change = parseUpdate(input);
      const values = change.fields ? parseInput(entity, change.fields) : null;
      const table = tables[entity];
      return db.transaction(async (tx) => {
        const [current] = await tx
          .select()
          .from(table)
          .where(eq(table.id, id))
          .for("update");
        if (!current)
          throw new AppError("NOT_FOUND", "La ficha no existe.", 404);
        if (current.revision !== change.revision)
          throw new AppError(
            "CONFLICT",
            "Otra persona modificó esta ficha. Recargá los datos antes de guardar.",
            409,
          );
        const [before] = await enrich(tx, entity, [current]);
        if (entity === "presentations" && values)
          await checkReferences(tx, values, current);
        if (entity === "presentations" && change.archived === false)
          await checkReferences(tx, current);
        if (
          entity === "items" &&
          values &&
          values.baseUnit !== before.baseUnit
        ) {
          const [used] = await tx
            .select({ id: purchasePresentations.id })
            .from(purchasePresentations)
            .where(eq(purchasePresentations.itemId, id))
            .limit(1);
          const [hasHistory] = await tx
            .select({ id: inventoryMovements.id })
            .from(inventoryMovements)
            .where(eq(inventoryMovements.itemId, id))
            .limit(1);
          const [physicalHistory] = await tx
            .select({ id: stockMovements.id })
            .from(stockMovements)
            .where(eq(stockMovements.itemId, id))
            .limit(1);
          const [directProduct] = await tx
            .select({ id: productFulfillmentVersions.id })
            .from(productFulfillmentVersions)
            .where(eq(productFulfillmentVersions.itemId, id))
            .limit(1);
          const [recipeUse] = await tx
            .select({ id: recipeOptions.id })
            .from(recipeOptions)
            .where(eq(recipeOptions.itemId, id))
            .limit(1);
          const [recipeOutput] = await tx
            .select({ id: recipes.id })
            .from(recipes)
            .where(eq(recipes.outputItemId, id))
            .limit(1);
          const [modifierUse] = await tx
            .select({ id: modifierOptionComponents.id })
            .from(modifierOptionComponents)
            .where(eq(modifierOptionComponents.itemId, id))
            .limit(1);
          const [overrideUse] = await tx
            .select({ id: recipeModifierOptionComponents.id })
            .from(recipeModifierOptionComponents)
            .where(eq(recipeModifierOptionComponents.itemId, id))
            .limit(1);
          const [saleUse] = await tx
            .select({ id: saleLineComponents.id })
            .from(saleLineComponents)
            .where(eq(saleLineComponents.itemId, id))
            .limit(1);
          if (
            used ||
            hasHistory ||
            physicalHistory ||
            directProduct ||
            recipeUse ||
            recipeOutput ||
            modifierUse ||
            overrideUse ||
            saleUse
          )
            throw new AppError(
              "UNIT_IN_USE",
              "Este insumo tiene presentaciones, recetas o historial de inventario. Conservá su unidad base.",
              409,
            );
        }
        const fields = values
          ? entity === "products"
            ? { name: values.name as string }
            : values
          : { archivedAt: change.archived ? new Date() : null };
        const [updated] = await tx
          .update(table)
          .set({
            ...fields,
            revision: current.revision + 1,
            updatedAt: new Date(),
          })
          .where(and(eq(table.id, id), eq(table.revision, change.revision)))
          .returning();
        if (!updated)
          throw new AppError(
            "CONFLICT",
            "La ficha cambió. Recargá los datos.",
            409,
          );
        if (entity === "products" && values) await writePrices(tx, id, values);
        const [after] = await enrich(tx, entity, [updated]);
        await tx.insert(auditEvents).values({
          actorId: actor.id,
          entity,
          recordId: id,
          action: values ? "update" : change.archived ? "archive" : "restore",
          before,
          after,
        });
        return after;
      });
    },
  };
}
