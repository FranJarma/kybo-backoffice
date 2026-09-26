import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gt, lte, or, isNull, sql } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { ingredients } from "@/db/business-schema";
import { recipes, recipeVersions } from "@/db/recipe-schema";
import { inventoryLots, stockBalances } from "@/db/inventory-schema";
import {
  productionBatches,
  productionSelections,
  productionAllocations,
} from "@/db/production-schema";
import { requireCatalogAccess, type Actor } from "@/lib/access";
import {
  actorName,
  audit,
  businessDate,
  claim,
  conflict,
  fingerprint,
  invalid,
  lockIngredient,
  move,
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

type LockedIngredient = Awaited<ReturnType<typeof lockIngredient>>;
type Allocation = {
  ingredientId: string;
  lotId: string;
  ingredientName: string;
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
) {
  const date = businessDate(now);
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
    const total = (needed.get(option.ingredientId) ?? 0n) + qty;
    safeQuantity(total);
    needed.set(option.ingredientId, total);
  }
  if (!needed.size)
    invalid("La producción debe consumir al menos un ingrediente.");
  if (needed.has(recipe.targetId))
    invalid("Una preparación no puede consumirse a sí misma.");
  const locked = new Map<string, LockedIngredient>();
  for (const id of [...needed.keys(), recipe.targetId].sort()) {
    if (locking) locked.set(id, await lockIngredient(tx, id, true));
    else {
      const [row] = await tx
        .select()
        .from(ingredients)
        .where(eq(ingredients.id, id));
      if (!row || row.archivedAt)
        conflict("Hay un insumo archivado. Revisá la receta.");
      const [balance] = await tx
        .select()
        .from(stockBalances)
        .where(eq(stockBalances.ingredientId, id));
      locked.set(id, {
        row,
        balance: balance ?? {
          ingredientId: id,
          physicalQuantity: "0.000000",
          stockValue: "0.000000",
        },
      });
    }
  }
  const allocations: Allocation[] = [];
  const availability: ProductionPreview["ingredients"] = [];
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
      .select()
      .from(inventoryLots)
      .where(
        and(
          eq(inventoryLots.ingredientId, id),
          eq(inventoryLots.blocked, false),
          gt(inventoryLots.remainingQuantity, "0"),
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
      ingredientId: id,
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
        ingredientId: id,
        lotId: lot.id,
        ingredientName: row.name,
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
    ingredients: availability,
  };
  return { recipe, locked, allocations, preview };
}

const summary = (row: typeof productionBatches.$inferSelect): BatchSummary => ({
  ...row,
  createdAt: row.createdAt.toISOString(),
});
async function detail(db: AppDb | Tx, id: string): Promise<BatchDetail> {
  const [row] = await db
    .select()
    .from(productionBatches)
    .where(eq(productionBatches.id, id));
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
      const input = parseProduction(raw);
      return db.transaction(
        async (tx) => (await prepare(tx, input, now(), false)).preview,
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
    async record(actor: Actor, raw: unknown): Promise<BatchDetail> {
      requireCatalogAccess(actor);
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
        if (previous) return detail(tx, previous);
        const { recipe, locked, allocations, preview } = await prepare(
          tx,
          input,
          now(),
          true,
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
        const [lot] = await tx
          .insert(inventoryLots)
          .values({
            ingredientId: recipe.targetId,
            receivedOn: input.producedOn,
            expiresOn: input.expiresOn,
            lotCode: input.lotCode,
            initialQuantity: input.actualOutput,
            remainingQuantity: input.actualOutput,
          })
          .returning();
        await tx
          .insert(productionBatches)
          .values({
            id,
            recipeVersionId: recipe.versionId,
            outputIngredientId: recipe.targetId,
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
        await tx
          .insert(productionSelections)
          .values(
            input.selections.map((selection) => ({
              ...selection,
              batchId: id,
            })),
          );
        for (const [position, allocation] of allocations.entries()) {
          await tx
            .update(inventoryLots)
            .set({
              remainingQuantity: sql`${inventoryLots.remainingQuantity} - ${allocation.quantity}::numeric`,
              revision: sql`${inventoryLots.revision} + 1`,
            })
            .where(eq(inventoryLots.id, allocation.lotId));
          await move(
            tx,
            actor,
            allocation.ingredientId,
            allocation.lotId,
            "production_out",
            -integer(allocation.quantity),
            null,
            `Producción: ${recipe.name}`,
            id,
            locked.get(allocation.ingredientId)!.balance,
          );
          await tx
            .insert(productionAllocations)
            .values({ ...allocation, batchId: id, position });
        }
        await move(
          tx,
          actor,
          recipe.targetId,
          lot.id,
          "production_in",
          integer(input.actualOutput),
          preview.totalCost === null ? null : integer(preview.totalCost),
          `Producción: ${recipe.name}`,
          id,
          locked.get(recipe.targetId)!.balance,
        );
        await audit(tx, actor, "production", id, "produce", {
          recipeVersionId: recipe.versionId,
          outputLotId: lot.id,
          actualOutput: input.actualOutput,
          totalCost: preview.totalCost,
        });
        return detail(tx, id);
      });
    },
    async get(actor: Actor, id: string) {
      requireCatalogAccess(actor);
      recipeId(id);
      return detail(db, id);
    },
    async list(
      actor: Actor,
      offset = 0,
    ): Promise<{ rows: BatchSummary[]; total: number }> {
      requireCatalogAccess(actor);
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000)
        invalid("Página inválida.");
      return db.transaction(
        async (tx) => {
          const rows = await tx
            .select()
            .from(productionBatches)
            .orderBy(
              desc(productionBatches.createdAt),
              desc(productionBatches.id),
            )
            .limit(50)
            .offset(offset);
          const [total] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(productionBatches);
          return { rows: rows.map(summary), total: total.n };
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
  };
}
