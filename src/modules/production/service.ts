import { requireOperationalContext } from "../branches/context";
import type { OperationalContext } from "../operations/types";
import { businessDate as branchBusinessDate } from "../operations/business-date";
import { inventoryValuations, lotLocationBalances } from "@/db/stock-schema";
import { productionOrders } from "@/db/production-order-schema";
import { stockDocuments } from "@/db/inventory-document-schema";
import { lockStock } from "../inventory/locking";
import { reserveStock, settleReservation } from "../inventory/reservations";
import { postMovement } from "../inventory/ledger";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, lte, or, isNull, sql } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { items } from "@/db/business-schema";
import { recipes, recipeVersions } from "@/db/recipe-schema";
import { inventoryLots } from "@/db/inventory-schema";
import {
  productionBatches,
  productionSelections,
  productionAllocations,
} from "@/db/production-schema";
import { requireCatalogAccess, type Actor } from "@/lib/access";
import {
  actorName,
  audit,
  claim,
  conflict,
  fingerprint,
  invalid,
  nextBalance,
  notFound,
  type Tx,
} from "@/modules/inventory/service";
import {
  exactDivision,
  integer,
  roundedDivision,
  safeQuantity,
  safeScaled,
  SCALE,
  six,
} from "@/modules/inventory/decimal";
import { recipeDefinition, recipeId } from "@/modules/recipes/service";
import {
  parseProduction,
  parseProductionOperation,
  type ParsedProduction,
} from "./validation";
import type { BatchDetail, BatchSummary, ProductionPreview } from "./types";

type LockedItem = {
  row: typeof items.$inferSelect;
  balance: {
    itemId: string;
    physicalQuantity: string;
    stockValue: string | null;
  };
};
type Allocation = {
  itemId: string;
  lotId: string;
  itemName: string;
  baseUnit: string;
  quantity: string;
  totalCost: string | null;
  unitCost: string | null;
};
async function prepare(
  tx: Tx,
  input: ParsedProduction,
  now: Date,
  locking: boolean,
  ctx: OperationalContext,
) {
  const date = branchBusinessDate(now, ctx.timeZone);
  if (input.producedOn !== date)
    invalid(
      "Registrá la producción del día de hoy. La carga retroactiva todavía no está habilitada.",
    );
  if (input.expiresOn && input.expiresOn <= date)
    invalid("El vencimiento del preparado debe ser posterior a hoy.");
  if (locking)
    await tx
      .select()
      .from(recipes)
      .where(eq(recipes.id, input.recipeId))
      .for("share");
  const recipe = await recipeDefinition(tx, input.recipeId);
  if (recipe.kind !== "preparation")
    invalid("Elegí una receta de preparación.");
  if (recipe.revision !== input.revision)
    conflict("La receta cambió. Volvé a seleccionarla antes de producir.");
  if (recipe.archived) conflict("El preparado está archivado.");
  const expectedOutput = safeQuantity(
    exactDivision(
      integer(recipe.yieldQuantity) * integer(input.multiplier),
      SCALE,
    ),
  );
  if (integer(expectedOutput) === 0n)
    invalid("El rendimiento esperado debe ser positivo.");
  const needed = new Map<string, bigint>();
  const seen = new Set<string>();
  if (input.selections.length !== recipe.lines.length)
    invalid("Completá todos los ingredientes de la receta.");
  for (const selection of input.selections) {
    if (seen.has(selection.lineId))
      invalid("Una línea de receta aparece más de una vez.");
    seen.add(selection.lineId);
    const line = recipe.lines.find((l) => l.id === selection.lineId);
    if (!line)
      return invalid("La línea no pertenece a esta versión de la receta.");
    const qty = integer(selection.quantity);
    if (selection.optionId === null) {
      if (!line.optional || qty !== 0n)
        invalid(
          "Solo se puede omitir un ingrediente opcional con cantidad cero.",
        );
      continue;
    }
    const option = line.options.find((o) => o.id === selection.optionId);
    if (!option) return invalid("La alternativa no pertenece a esta receta.");
    if (qty <= 0n) invalid("El consumo real debe ser positivo.");
    const total = (needed.get(option.itemId) ?? 0n) + qty;
    safeQuantity(total);
    needed.set(option.itemId, total);
  }
  if (!needed.size)
    invalid("La producción debe consumir al menos un ingrediente.");
  if (needed.has(recipe.targetId))
    invalid("Una preparación no puede consumirse a sí misma.");
  const locked = new Map<string, LockedItem>();
  const itemIds = [...needed.keys(), recipe.targetId].sort();
  if (locking)
    await lockStock(
      tx,
      ctx,
      itemIds.map((itemId) => ({ itemId, locationId: input.locationId })),
    );
  for (const id of itemIds) {
    const [row] = await tx.select().from(items).where(eq(items.id, id));
    if (!row || row.archivedAt || !row.recipeUsable)
      conflict("Elegí artículos activos habilitados para recetas.");
    const [balance] = await tx
      .select({
        itemId: inventoryValuations.itemId,
        physicalQuantity: inventoryValuations.quantity,
        stockValue: inventoryValuations.value,
      })
      .from(inventoryValuations)
      .where(
        and(
          eq(inventoryValuations.itemId, id),
          eq(inventoryValuations.branchId, ctx.branchId),
        ),
      );
    locked.set(id, {
      row,
      balance: balance ?? {
        itemId: id,
        physicalQuantity: "0.000000",
        stockValue: "0.000000",
      },
    });
  }
  const allocations: Allocation[] = [];
  const availability: ProductionPreview["items"] = [];
  const lotState: {
    id: string;
    revision: number;
    remainingQuantity: string;
    expiresOn: string | null;
    receivedOn: string;
  }[] = [];
  let totalCost = 0n;
  let earliestExpiry: string | null = null;
  const missingCosts = new Set<string>();
  for (const [id, qty] of [...needed].sort(([a], [b]) => a.localeCompare(b))) {
    const { row, balance } = locked.get(id)!;
    const query = tx
      .select({
        id: inventoryLots.id,
        revision: lotLocationBalances.revision,
        receivedOn: inventoryLots.receivedOn,
        expiresOn: inventoryLots.expiresOn,
        remainingQuantity: sql<string>`${lotLocationBalances.quantity} - ${lotLocationBalances.reserved}`,
      })
      .from(inventoryLots)
      .innerJoin(
        lotLocationBalances,
        and(
          eq(lotLocationBalances.lotId, inventoryLots.id),
          eq(lotLocationBalances.locationId, input.locationId),
          eq(lotLocationBalances.branchId, ctx.branchId),
        ),
      )
      .where(
        and(
          eq(inventoryLots.itemId, id),
          eq(inventoryLots.blocked, false),
          eq(lotLocationBalances.blocked, false),
          sql`${lotLocationBalances.quantity} > ${lotLocationBalances.reserved}`,
          lte(inventoryLots.receivedOn, date),
          or(
            isNull(inventoryLots.expiresOn),
            gt(inventoryLots.expiresOn, date),
          ),
        ),
      )
      .orderBy(
        sql`${inventoryLots.expiresOn} asc nulls last`,
        asc(inventoryLots.receivedOn),
        asc(inventoryLots.id),
      );
    const lots = locking ? await query.for("update") : await query;
    lotState.push(
      ...lots.map((l) => ({
        id: l.id,
        revision: l.revision,
        remainingQuantity: l.remainingQuantity,
        expiresOn: l.expiresOn,
        receivedOn: l.receivedOn,
      })),
    );
    const usable = lots.reduce(
      (sum, lot) => sum + integer(lot.remainingQuantity),
      0n,
    );
    availability.push({
      itemId: id,
      name: row.name,
      baseUnit: row.baseUnit,
      needed: six(qty),
      usable: six(usable),
      shortfall: six(qty > usable ? qty - usable : 0n),
    });
    let remaining = qty;
    let oldQty = integer(balance.physicalQuantity);
    let oldValue =
      balance.stockValue === null ? null : integer(balance.stockValue);
    for (const lot of lots) {
      if (!remaining) break;
      const used =
        remaining < integer(lot.remainingQuantity)
          ? remaining
          : integer(lot.remainingQuantity);
      const value = nextBalance(oldQty, oldValue, -used, null);
      oldQty = value.nextQty;
      oldValue = value.nextValue;
      remaining -= used;
      if (value.applied === null) missingCosts.add(row.name);
      else totalCost -= value.applied;
      if (lot.expiresOn && (!earliestExpiry || lot.expiresOn < earliestExpiry))
        earliestExpiry = lot.expiresOn;
      allocations.push({
        itemId: id,
        lotId: lot.id,
        itemName: row.name,
        baseUnit: row.baseUnit,
        quantity: six(used),
        totalCost: value.applied === null ? null : six(-value.applied),
        unitCost: value.unitCost === null ? null : six(value.unitCost),
      });
    }
  }
  if (input.expiresOn && earliestExpiry && input.expiresOn > earliestExpiry)
    invalid(
      `El preparado no puede vencer después del ${earliestExpiry.split("-").reverse().join("/")}, vencimiento de un lote consumido.`,
    );
  const canConfirm = availability.every((i) => i.shortfall === "0.000000");
  const cost =
    missingCosts.size || !canConfirm ? null : safeScaled(totalCost, 24);
  const unitCost =
    cost === null
      ? null
      : safeScaled(
          roundedDivision(cost * SCALE, integer(input.actualOutput)),
          24,
        );
  const outputBalance = locked.get(recipe.targetId)!.balance;
  const future = nextBalance(
    integer(outputBalance.physicalQuantity),
    outputBalance.stockValue === null
      ? null
      : integer(outputBalance.stockValue),
    integer(input.actualOutput),
    cost,
  );
  safeQuantity(future.nextQty);
  if (future.nextValue !== null) safeScaled(future.nextValue, 24);
  const token = fingerprint("production-preview", {
    input,
    date,
    versionId: recipe.versionId,
    balances: [...locked].map(([id, { row, balance }]) => ({
      id,
      baseUnit: row.baseUnit,
      ...balance,
    })),
    lots: lotState,
  });
  const preview: ProductionPreview = {
    token,
    canConfirm,
    businessDate: date,
    expectedOutput,
    actualOutput: input.actualOutput,
    yieldDifference: six(integer(input.actualOutput) - integer(expectedOutput)),
    totalCost: cost === null ? null : six(cost),
    unitCost: unitCost === null ? null : six(unitCost),
    missingCosts: [...missingCosts],
    earliestExpiry,
    items: availability,
  };
  return { recipe, locked, allocations, preview };
}

const summary = (row: typeof productionBatches.$inferSelect): BatchSummary => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
});
async function detail(
  db: AppDb | Tx,
  id: string,
  branchId: string,
): Promise<BatchDetail> {
  const [row] = await db
    .select()
    .from(productionBatches)
    .where(
      and(
        eq(productionBatches.id, id),
        eq(productionBatches.branchId, branchId),
      ),
    );
  if (!row) notFound();
  const [version] = await db
    .select()
    .from(recipeVersions)
    .where(eq(recipeVersions.id, row.recipeVersionId));
  const allocations = await db
    .select()
    .from(productionAllocations)
    .where(eq(productionAllocations.batchId, id))
    .orderBy(asc(productionAllocations.position));
  const selections = await db
    .select()
    .from(productionSelections)
    .where(eq(productionSelections.batchId, id));
  return {
    ...summary(row),
    recipeId: version.recipeId,
    recipeRevision: version.version,
    allocations,
    selections,
  };
}

export function createProductionService(
  db: AppDb,
  now: () => Date = () => new Date(),
) {
  return {
    async preview(actor: Actor, raw: unknown) {
      requireCatalogAccess(actor);
      const ctx = await requireOperationalContext(
        db,
        actor,
        actor.branchId ?? "",
      );
      if (ctx.role === "staff")
        invalid("Se requiere permiso de encargado.", "FORBIDDEN", 403);
      const input = parseProduction(raw);
      return db.transaction(
        async (tx) => (await prepare(tx, input, now(), false, ctx)).preview,
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
    async record(actor: Actor, raw: unknown): Promise<BatchDetail> {
      requireCatalogAccess(actor);
      const ctx = await requireOperationalContext(
        db,
        actor,
        actor.branchId ?? "",
      );
      if (ctx.role === "staff")
        invalid("Se requiere permiso de encargado.", "FORBIDDEN", 403);
      const parsed = parseProductionOperation(raw);
      const { requestId, previewToken, ...input } = parsed;
      return db.transaction(async (tx) => {
        const id = randomUUID();
        const previous = await claim(
          tx,
          actor,
          "production",
          requestId,
          fingerprint("production", parsed),
          id,
        );
        if (previous) return detail(tx, previous, ctx.branchId);
        const { recipe, allocations, preview } = await prepare(
          tx,
          input,
          now(),
          true,
          ctx,
        );
        if (!preview.canConfirm)
          invalid(
            "No hay stock utilizable suficiente. Revisá los faltantes.",
            "INSUFFICIENT_STOCK",
            409,
          );
        if (previewToken !== preview.token)
          invalid(
            "El stock o su costo cambió. Revisá una nueva vista previa antes de confirmar.",
            "STALE_PREVIEW",
            409,
          );
        await tx.insert(productionOrders).values({
          id,
          branchId: ctx.branchId,
          locationId: input.locationId,
          recipeVersionId: recipe.versionId,
          outputItemId: recipe.targetId,
          plannedQuantity: preview.expectedOutput,
          composition: { selections: input.selections, allocations },
          state: "confirmed",
        });
        const [document] = await tx
          .insert(stockDocuments)
          .values({
            branchId: ctx.branchId,
            kind: "production",
            productionOrderId: id,
          })
          .returning();
        const reservation = await reserveStock(tx, ctx, {
          operationId: requestId,
          documentId: document.id,
          demands: allocations.map((a) => ({
            itemId: a.itemId,
            locationId: input.locationId,
            quantity: a.quantity,
          })),
        });
        await settleReservation(tx, ctx, {
          operationId: requestId,
          reservationId: reservation.reservationId,
          consume: reservation.allocations,
          release: [],
        });
        await postMovement(tx, ctx, {
          operationId: requestId,
          documentId: document.id,
          action: "production",
          reason: input.notes,
          legs: reservation.allocations.map((a) => ({
            ...a,
            direction: "out",
            incomingValue: null,
          })),
        });
        const [lot] = await tx
          .insert(inventoryLots)
          .values({
            itemId: recipe.targetId,
            receivedOn: input.producedOn,
            expiresOn: input.expiresOn,
            lotCode: input.lotCode,
            initialQuantity: input.actualOutput,
            remainingQuantity: input.actualOutput,
          })
          .returning();
        await tx.insert(productionBatches).values({
          id,
          branchId: ctx.branchId,
          recipeVersionId: recipe.versionId,
          outputItemId: recipe.targetId,
          outputName: recipe.name,
          baseUnit: recipe.baseUnit,
          outputLotId: lot.id,
          multiplier: input.multiplier,
          expectedOutput: preview.expectedOutput,
          actualOutput: input.actualOutput,
          totalCost: preview.totalCost,
          unitCost: preview.unitCost,
          producedOn: input.producedOn,
          expiresOn: input.expiresOn,
          lotCode: input.lotCode,
          notes: input.notes,
          actorId: actor.id,
          actorName: await actorName(tx, actor),
        });
        await tx.insert(productionSelections).values(
          input.selections.map((selection) => ({
            ...selection,
            batchId: id,
          })),
        );
        for (const [position, allocation] of allocations.entries()) {
          await tx
            .insert(productionAllocations)
            .values({ ...allocation, batchId: id, position });
        }
        await postMovement(tx, ctx, {
          operationId: requestId,
          documentId: document.id,
          action: "production",
          reason: input.notes,
          legs: [
            {
              itemId: recipe.targetId,
              lotId: lot.id,
              locationId: input.locationId,
              quantity: input.actualOutput,
              direction: "in",
              incomingValue: preview.totalCost,
            },
          ],
        });
        await tx
          .update(productionOrders)
          .set({
            state: "completed",
            actualQuantity: input.actualOutput,
            revision: 2,
          })
          .where(eq(productionOrders.id, id));
        await audit(tx, actor, "production", id, "produce", {
          recipeVersionId: recipe.versionId,
          outputLotId: lot.id,
          actualOutput: input.actualOutput,
          totalCost: preview.totalCost,
        });
        return detail(tx, id, ctx.branchId);
      });
    },
    async get(actor: Actor, id: string) {
      requireCatalogAccess(actor);
      const ctx = await requireOperationalContext(
        db,
        actor,
        actor.branchId ?? "",
      );
      if (ctx.role === "staff")
        invalid("Se requiere permiso de encargado.", "FORBIDDEN", 403);
      recipeId(id);
      return detail(db, id, ctx.branchId);
    },
    async list(
      actor: Actor,
      offset = 0,
    ): Promise<{ rows: BatchSummary[]; total: number }> {
      requireCatalogAccess(actor);
      const ctx = await requireOperationalContext(
        db,
        actor,
        actor.branchId ?? "",
      );
      if (ctx.role === "staff")
        invalid("Se requiere permiso de encargado.", "FORBIDDEN", 403);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000)
        invalid("Página inválida.");
      return db.transaction(
        async (tx) => {
          const rows = await tx
            .select()
            .from(productionBatches)
            .where(eq(productionBatches.branchId, ctx.branchId))
            .orderBy(
              desc(productionBatches.createdAt),
              desc(productionBatches.id),
            )
            .limit(50)
            .offset(offset);
          const [total] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(productionBatches)
            .where(eq(productionBatches.branchId, ctx.branchId));
          return { rows: rows.map(summary), total: total.n };
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
  };
}
