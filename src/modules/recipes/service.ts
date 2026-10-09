import { consumptionQuantity } from "./waste";
import {
  requireCatalogManagement,
  requireCatalogRead,
} from "../branches/context";
import { publishFulfillment } from "../products/fulfillment";
import {
  productFulfillments,
  productFulfillmentVersions,
} from "@/db/product-fulfillment-schema";
import { loadConfiguration, saveBindings } from "./configuration";
import { defaultSelections, resolveComposition } from "./composition";
import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { items, products, productPrices } from "@/db/business-schema";
import {
  recipes,
  recipeVersions,
  recipeLines,
  recipeOptions,
  recipeGraphLock,
} from "@/db/recipe-schema";
import type { Actor } from "@/lib/access";
import {
  audit,
  claim,
  conflict,
  fingerprint,
  invalid,
  notFound,
  type Tx,
} from "@/modules/inventory/service";
import {
  integer,
  roundedDivision,
  safeScaled,
  SCALE,
  six,
} from "@/modules/inventory/decimal";
import { parseRecipe, parseSelections } from "./validation";
import type { CostResult, RecipeDetail, RecipeKind, RecipeList } from "./types";

type ReadDb = AppDb | Tx;
export function recipeId(id: string) {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  )
    invalid("Identificador inválido.");
}
export async function recipeDefinition(
  db: ReadDb,
  id: string,
  versionId?: string,
): Promise<Omit<RecipeDetail, "cost">> {
  const [row] = await db.select().from(recipes).where(eq(recipes.id, id));
  if (!row) notFound();
  const [version] = await db
    .select()
    .from(recipeVersions)
    .where(
      and(
        eq(recipeVersions.recipeId, id),
        versionId
          ? eq(recipeVersions.id, versionId)
          : eq(recipeVersions.version, row.revision),
      ),
    );
  if (!version) notFound();
  const target =
    row.kind === "product"
      ? (
          await db
            .select()
            .from(products)
            .where(eq(products.id, row.productId!))
        )[0]
      : (
          await db.select().from(items).where(eq(items.id, row.outputItemId!))
        )[0];
  const lines = await db
    .select()
    .from(recipeLines)
    .where(eq(recipeLines.versionId, version.id))
    .orderBy(asc(recipeLines.position));
  const options = lines.length
    ? await db
        .select({
          option: recipeOptions,
          archivedAt: items.archivedAt,
          itemClass: items.class,
        })
        .from(recipeOptions)
        .innerJoin(items, eq(items.id, recipeOptions.itemId))
        .where(
          inArray(
            recipeOptions.lineId,
            lines.map((l) => l.id),
          ),
        )
        .orderBy(asc(recipeOptions.position))
    : [];
  const versions = await db
    .select()
    .from(recipeVersions)
    .where(eq(recipeVersions.recipeId, id))
    .orderBy(desc(recipeVersions.version));
  return {
    id,
    kind: row.kind as RecipeKind,
    targetId: row.productId ?? row.outputItemId!,
    name: version.outputName,
    baseUnit: version.outputUnit,
    yieldQuantity: version.yieldQuantity,
    revision: version.version,
    versionId: version.id,
    compositionModel: version.compositionModel as "legacy" | "configurable",
    notes: version.notes,
    archived: !!target?.archivedAt,
    lines: lines.map((line) => ({
      id: line.id,
      optional: line.optional,
      options: options
        .filter((o) => o.option.lineId === line.id)
        .map(({ option, archivedAt, itemClass }) => ({
          itemClass,
          id: option.id,
          itemId: option.itemId,
          name: option.itemName,
          quantity: option.quantity,
          wastePercent: option.wastePercent,
          baseUnit: option.baseUnit,
          archived: !!archivedAt,
          unitCost: null,
        })),
    })),
    versions: versions.map((v) => ({
      id: v.id,
      version: v.version,
      createdAt: v.createdAt.toISOString(),
    })),
  };
}

async function graph(db: ReadDb) {
  const current = await db
    .select({ recipe: recipes, version: recipeVersions })
    .from(recipes)
    .innerJoin(
      recipeVersions,
      and(
        eq(recipeVersions.recipeId, recipes.id),
        eq(recipeVersions.version, recipes.revision),
      ),
    );
  const options = await db
    .select({ option: recipeOptions, versionId: recipeLines.versionId })
    .from(recipeOptions)
    .innerJoin(recipeLines, eq(recipeLines.id, recipeOptions.lineId))
    .innerJoin(recipeVersions, eq(recipeVersions.id, recipeLines.versionId))
    .innerJoin(
      recipes,
      and(
        eq(recipes.id, recipeVersions.recipeId),
        eq(recipes.revision, recipeVersions.version),
      ),
    )
    .orderBy(asc(recipeLines.position), asc(recipeOptions.position));
  return current.map((r) => ({
    ...r,
    options: options
      .filter((o) => o.versionId === r.version.id)
      .map((o) => o.option),
  }));
}
export async function costContext(db: ReadDb) {
  const stock = new Map((await db.select().from(items)).map((i) => [i.id, i]));
  const prepared = new Map(
    (await graph(db))
      .filter((r) => r.recipe.kind === "preparation")
      .map((r) => [r.recipe.outputItemId!, r]),
  );
  const cache = new Map<string, { value: bigint | null; missing: string[] }>();
  const estimate = (
    id: string,
    path: string[] = [],
  ): { value: bigint | null; missing: string[] } => {
    if (path.includes(id) || path.length > 100)
      invalid(
        "Hay un ciclo o demasiados niveles en las preparaciones.",
        "RECIPE_CYCLE",
        409,
      );
    const existing = cache.get(id);
    if (existing) return existing;
    const item = stock.get(id);
    if (!item || item.archivedAt)
      return {
        value: null,
        missing: [item ? `${item.name} (archivado)` : "Insumo no disponible"],
      };
    const prep = prepared.get(id);
    let result: { value: bigint | null; missing: string[] };
    if (!prep)
      result = {
        value: item.unitCost === null ? null : integer(item.unitCost),
        missing: item.unitCost === null ? [item.name] : [],
      };
    else {
      let total = 0n;
      const missing = new Set<string>();
      for (const o of prep.options.filter((o) => o.position === 0)) {
        const cost = estimate(o.itemId, [...path, id]);
        cost.missing.forEach((n) => missing.add(n));
        if (cost.value !== null)
          total += roundedDivision(
            cost.value *
              integer(consumptionQuantity(o.quantity, o.wastePercent)),
            SCALE,
          );
      }
      result = {
        value: missing.size
          ? null
          : safeScaled(
              roundedDivision(
                total * SCALE,
                integer(prep.version.yieldQuantity),
              ),
              24,
            ),
        missing: [...missing],
      };
    }
    cache.set(id, result);
    return result;
  };
  return estimate;
}
async function calculate(
  db: ReadDb,
  recipe: Omit<RecipeDetail, "cost">,
  selections: { lineId: string; optionId: string | null }[] = [],
): Promise<CostResult> {
  const estimate = await costContext(db);
  const choices = new Map<string, string | null>();
  for (const choice of selections) {
    if (
      choices.has(choice.lineId) ||
      !recipe.lines.some((l) => l.id === choice.lineId)
    )
      invalid("Selección de receta inválida.");
    choices.set(choice.lineId, choice.optionId);
  }
  let total = 0n;
  const missing = new Set<string>();
  const lines = recipe.lines.map((line) => {
    // Include comparable replacement costs in the detail response.
    for (const o of line.options) {
      const cost = estimate(o.itemId);
      o.unitCost = cost.value === null ? null : six(cost.value);
    }
    const optionId = choices.has(line.id)
      ? choices.get(line.id)!
      : line.options[0].id;
    if (optionId === null) {
      if (!line.optional)
        invalid("No se puede omitir un ingrediente obligatorio.");
      return { lineId: line.id, optionId, cost: "0.000000" };
    }
    const option = line.options.find((o) => o.id === optionId);
    if (!option) return invalid("La alternativa no pertenece a esta receta.");
    const cost = estimate(option.itemId);
    cost.missing.forEach((n) => missing.add(n));
    const value =
      cost.value === null
        ? null
        : safeScaled(
            roundedDivision(
              cost.value *
                integer(
                  consumptionQuantity(option.quantity, option.wastePercent),
                ),
              SCALE,
            ),
            24,
          );
    if (value !== null) total += value;
    return {
      lineId: line.id,
      optionId,
      cost: value === null ? null : six(value),
    };
  });
  safeScaled(total, 24);
  return {
    totalCost: missing.size ? null : six(total),
    unitCost: missing.size
      ? null
      : six(
          safeScaled(
            roundedDivision(total * SCALE, integer(recipe.yieldQuantity)),
            24,
          ),
        ),
    missing: [...missing],
    lines,
  };
}
async function detail(
  db: ReadDb,
  id: string,
  versionId?: string,
): Promise<RecipeDetail> {
  const recipe = await recipeDefinition(db, id, versionId);
  if (recipe.compositionModel === "configurable") {
    const configuration = await loadConfiguration(db, recipe.versionId);
    const { costComposition } = await import("./costing");
    const cost = await costComposition(
      db,
      resolveComposition(configuration, defaultSelections(configuration))
        .components,
    );
    return {
      ...recipe,
      configuration,
      cost: {
        totalCost: cost.totalCost,
        unitCost: cost.totalCost,
        missing: cost.missing,
        lines: [],
      },
    };
  }
  return { ...recipe, cost: await calculate(db, recipe) };
}
async function assertAcyclic(db: ReadDb, output: string, inputs: string[]) {
  const dependencies = new Map(
    (await graph(db))
      .filter((r) => r.recipe.kind === "preparation")
      .map((r) => [r.recipe.outputItemId!, r.options.map((o) => o.itemId)]),
  );
  dependencies.set(output, inputs);
  const visited = new Set<string>();
  const path = new Set<string>();
  const walk = (id: string) => {
    if (path.has(id) || path.size > 100)
      invalid(
        "Esta combinación crea una dependencia circular o excede 100 niveles.",
        "RECIPE_CYCLE",
        409,
      );
    if (visited.has(id)) return;
    path.add(id);
    for (const next of dependencies.get(id) ?? []) walk(next);
    path.delete(id);
    visited.add(id);
  };
  for (const id of dependencies.keys()) walk(id);
}

export function createRecipeService(db: AppDb) {
  return {
    async save(actor: Actor, raw: unknown): Promise<RecipeDetail> {
      await requireCatalogManagement(db, actor);
      const input = parseRecipe(raw);
      if (
        input.compositionModel === "legacy" &&
        (!input.lines.length || input.groups.length)
      )
        invalid("La receta requiere ingredientes.");
      if (
        input.compositionModel === "configurable" &&
        (input.kind !== "product" ||
          input.lines.some((l) => l.optional || l.options.length !== 1) ||
          (!input.lines.length && !input.groups.length))
      )
        invalid("Separá ingredientes fijos y grupos modificadores.");
      if (!!input.id !== !!input.revision)
        invalid("Falta la versión a editar.");
      if (input.kind === "product" && input.yieldQuantity !== "1.000000")
        invalid("Una receta de producto corresponde a una unidad de venta.");
      return db.transaction(async (tx) => {
        const versionId = randomUUID();
        const previous = await claim(
          tx,
          actor,
          "recipe",
          input.requestId,
          fingerprint("recipe", input),
          versionId,
        );
        if (previous) {
          const [version] = await tx
            .select()
            .from(recipeVersions)
            .where(eq(recipeVersions.id, previous));
          if (!version) notFound();
          return detail(tx, version.recipeId, previous);
        }
        await tx
          .insert(recipeGraphLock)
          .values({ id: 1 })
          .onConflictDoNothing();
        await tx
          .select()
          .from(recipeGraphLock)
          .where(eq(recipeGraphLock.id, 1))
          .for("update");
        const id = input.id ?? randomUUID();
        let revision = 1;
        if (input.id) {
          const [current] = await tx
            .select()
            .from(recipes)
            .where(eq(recipes.id, id))
            .for("update");
          if (!current) notFound();
          if (current.revision !== input.revision)
            conflict("La receta cambió. Recargá antes de editar.");
          if (
            current.kind !== input.kind ||
            (current.productId ?? current.outputItemId) !== input.targetId
          )
            conflict("El destino de una receta no se puede cambiar.");
          revision = current.revision + 1;
        } else {
          const [existing] = await tx
            .select()
            .from(recipes)
            .where(
              input.kind === "product"
                ? eq(recipes.productId, input.targetId)
                : eq(recipes.outputItemId, input.targetId),
            );
          if (existing)
            conflict(
              "Ya existe una receta para este producto o preparado. Editá esa receta.",
            );
        }
        const ids = [
          ...new Set(
            input.lines
              .flatMap((l) => l.options.map((o) => o.itemId))
              .concat(input.kind === "preparation" ? [input.targetId] : []),
          ),
        ].sort();
        const locked = new Map<string, typeof items.$inferSelect>();
        for (const itemId of ids) {
          const [item] = await tx
            .select()
            .from(items)
            .where(eq(items.id, itemId))
            .for("update");
          if (!item || item.archivedAt || !item.recipeUsable)
            conflict(
              "La receta requiere insumos activos. Revisá sus ingredientes.",
            );
          locked.set(itemId, item);
        }
        let name: string;
        let outputUnit: string;
        if (input.kind === "product") {
          const [target] = await tx
            .select()
            .from(products)
            .where(eq(products.id, input.targetId))
            .for("update");
          if (!target || target.archivedAt)
            conflict("Elegí un producto activo.");
          name = target.name;
          outputUnit = "unit";
        } else {
          const target = locked.get(input.targetId)!;
          name = target.name;
          outputUnit = target.baseUnit;
        }
        if (input.targetUnit && input.targetUnit !== outputUnit)
          conflict("La unidad del destino cambió. Recargá la ficha.");
        for (const line of input.lines) {
          if (
            new Set(line.options.map((o) => o.itemId)).size !==
            line.options.length
          )
            invalid(
              "No repitas un insumo en las alternativas de la misma línea.",
            );
          for (const option of line.options)
            if (
              option.baseUnit &&
              option.baseUnit !== locked.get(option.itemId)!.baseUnit
            )
              conflict("La unidad de un ingrediente cambió. Recargá la ficha.");
        }
        if (input.kind === "preparation")
          await assertAcyclic(
            tx,
            input.targetId,
            input.lines.flatMap((l) => l.options.map((o) => o.itemId)),
          );
        if (input.id)
          await tx.update(recipes).set({ revision }).where(eq(recipes.id, id));
        else
          await tx.insert(recipes).values({
            id,
            kind: input.kind,
            productId: input.kind === "product" ? input.targetId : null,
            outputItemId: input.kind === "preparation" ? input.targetId : null,
          });
        await tx.insert(recipeVersions).values({
          id: versionId,
          recipeId: id,
          version: revision,
          compositionModel: input.compositionModel,
          outputName: name,
          outputUnit,
          yieldQuantity: input.yieldQuantity,
          notes: input.notes,
          actorId: actor.id,
        });
        for (const [position, line] of input.lines.entries()) {
          const [savedLine] = await tx
            .insert(recipeLines)
            .values({ versionId, position, optional: line.optional })
            .returning();
          await tx.insert(recipeOptions).values(
            line.options.map((option, position) => ({
              lineId: savedLine.id,
              position,
              itemId: option.itemId,
              itemName: locked.get(option.itemId)!.name,
              baseUnit: locked.get(option.itemId)!.baseUnit,
              quantity: option.quantity,
              wastePercent: option.wastePercent,
            })),
          );
        }
        if (input.compositionModel === "configurable") {
          const previousVersion =
            revision > 1
              ? (
                  await tx
                    .select()
                    .from(recipeVersions)
                    .where(
                      and(
                        eq(recipeVersions.recipeId, id),
                        eq(recipeVersions.version, revision - 1),
                      ),
                    )
                )[0]?.id
              : undefined;
          await saveBindings(
            tx,
            versionId,
            input.targetId,
            input.groups,
            actor,
            previousVersion,
          );
        }
        if (
          input.kind === "product" &&
          input.compositionModel === "configurable"
        ) {
          const [current] = await tx
            .select({ version: productFulfillmentVersions.version })
            .from(productFulfillments)
            .innerJoin(
              productFulfillmentVersions,
              eq(productFulfillmentVersions.id, productFulfillments.versionId),
            )
            .where(eq(productFulfillments.productId, input.targetId));
          await publishFulfillment(
            tx,
            { actorId: actor.id, role: actor.role },
            input.targetId,
            {
              mode: "recipe",
              recipeVersionId: versionId,
              expectedVersion: current?.version ?? 0,
            },
          );
        }
        await audit(tx, actor, "recipes", id, input.id ? "version" : "create", {
          versionId,
          revision,
        });
        return detail(tx, id);
      });
    },
    async get(actor: Actor, id: string, versionId?: string) {
      await requireCatalogRead(db, actor);
      recipeId(id);
      if (versionId) recipeId(versionId);
      return db.transaction((tx) => detail(tx, id, versionId), {
        isolationLevel: "repeatable read",
        accessMode: "read only",
      });
    },
    async cost(actor: Actor, id: string, raw: unknown) {
      await requireCatalogRead(db, actor);
      recipeId(id);
      const input = parseSelections(raw);
      return db.transaction(
        async (tx) => {
          const recipe = await recipeDefinition(tx, id);
          if (recipe.revision !== input.revision)
            conflict("La receta cambió. Recargá sus ingredientes.");
          if (recipe.compositionModel === "configurable") {
            const config = await loadConfiguration(tx, recipe.versionId);
            const { costComposition } = await import("./costing");
            return costComposition(
              tx,
              resolveComposition(
                config,
                input.modifiers ?? defaultSelections(config),
              ).components,
            );
          }
          return calculate(tx, recipe, input.selections);
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
    async list(
      actor: Actor,
      kind?: RecipeKind,
      search = "",
      offset = 0,
    ): Promise<RecipeList> {
      await requireCatalogRead(db, actor);
      if (kind && !["product", "preparation"].includes(kind))
        invalid("Tipo de receta inválido.");
      if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1_000_000)
        invalid("Página inválida.");
      const term = `%${search
        .trim()
        .slice(0, 160)
        .replace(/[\\%_]/g, "\\$&")}%`;
      const where = and(
        kind ? eq(recipes.kind, kind) : undefined,
        sql`${recipeVersions.outputName} ilike ${term}`,
      );
      return db.transaction(
        async (tx) => {
          const rows = await tx
            .select({
              recipe: recipes,
              version: recipeVersions,
              productArchived: products.archivedAt,
              itemArchived: items.archivedAt,
              priceCounter: productPrices.amount,
            })
            .from(recipes)
            .innerJoin(
              recipeVersions,
              and(
                eq(recipeVersions.recipeId, recipes.id),
                eq(recipeVersions.version, recipes.revision),
              ),
            )
            .leftJoin(products, eq(products.id, recipes.productId))
            .leftJoin(
              productPrices,
              and(
                eq(productPrices.productId, recipes.productId),
                eq(productPrices.channel, "counter"),
              ),
            )
            .leftJoin(items, eq(items.id, recipes.outputItemId))
            .where(where)
            .orderBy(asc(recipeVersions.outputName), asc(recipes.id))
            .limit(100)
            .offset(offset);
          const [total] = await tx
            .select({ n: sql<number>`count(*)::int` })
            .from(recipes)
            .innerJoin(
              recipeVersions,
              and(
                eq(recipeVersions.recipeId, recipes.id),
                eq(recipeVersions.version, recipes.revision),
              ),
            )
            .where(where);
          const estimate = await costContext(tx);
          const currentGraph = await graph(tx);
          const unitCosts = new Map(
            currentGraph.map((r) => {
              let totalCost = 0n;
              let pending = false;
              for (const option of r.options.filter((o) => o.position === 0)) {
                const cost = estimate(option.itemId);
                if (cost.value === null) pending = true;
                else
                  totalCost += roundedDivision(
                    cost.value *
                      integer(
                        consumptionQuantity(
                          option.quantity,
                          option.wastePercent,
                        ),
                      ),
                    SCALE,
                  );
              }
              return [
                r.recipe.id,
                pending
                  ? null
                  : six(
                      safeScaled(
                        roundedDivision(
                          totalCost * SCALE,
                          integer(r.version.yieldQuantity),
                        ),
                        24,
                      ),
                    ),
              ];
            }),
          );
          for (const r of rows)
            if (r.version.compositionModel === "configurable") {
              const config = await loadConfiguration(tx, r.version.id);
              const { costComposition } = await import("./costing");
              unitCosts.set(
                r.recipe.id,
                (
                  await costComposition(
                    tx,
                    resolveComposition(config, defaultSelections(config))
                      .components,
                  )
                ).totalCost,
              );
            }
          return {
            rows: rows.map(
              ({
                recipe: r,
                version: v,
                productArchived,
                itemArchived,
                priceCounter,
              }) => ({
                id: r.id,
                unitCost: unitCosts.get(r.id) ?? null,
                priceCounter,
                kind: r.kind as RecipeKind,
                targetId: r.productId ?? r.outputItemId!,
                name: v.outputName,
                baseUnit: v.outputUnit,
                yieldQuantity: v.yieldQuantity,
                revision: r.revision,
                archived: !!(productArchived || itemArchived),
              }),
            ),
            total: total.n,
          };
        },
        { isolationLevel: "repeatable read", accessMode: "read only" },
      );
    },
  };
}
