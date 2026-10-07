import { publishGroup } from "@/modules/modifiers/service";
import { eq, asc, and } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import { items, products, productPrices } from "@/db/business-schema";
import { recipeVersions, recipes } from "@/db/recipe-schema";
import {
  modifierGroups,
  modifierGroupVersions,
  modifierOptions,
  modifierOptionComponents,
  recipeModifierGroups,
  recipeModifierOptions,
  recipeModifierOptionComponents,
  recipeModifierOptionPrices,
} from "@/db/modifier-schema";
import {
  notFound,
  invalid,
  conflict,
  type Tx,
} from "@/modules/inventory/service";
import { recipeDefinition } from "./service";
import type {
  Configuration,
  ConfiguredOption,
} from "@/modules/modifiers/types";
import type { BindingInput } from "@/modules/modifiers/validation";
import type { SaleChannel } from "@/modules/sales/types";
import type { Actor } from "@/lib/access";
import { salesAccess } from "@/modules/sales/validation";
import { defaultSelections, resolveComposition } from "./composition";
export async function loadConfiguration(
  db: AppDb | Tx,
  recipeVersionId: string,
): Promise<Configuration> {
  const [v] = await db
    .select()
    .from(recipeVersions)
    .where(eq(recipeVersions.id, recipeVersionId));
  if (!v) notFound();
  const def = await recipeDefinition(db, v.recipeId, v.id);
  const config: Configuration = {
    recipeVersionId: v.id,
    revision: v.version,
    model: v.compositionModel as Configuration["model"],
    yieldQuantity: v.yieldQuantity,
    fixed: def.lines.map((l) => l.options[0]),
    groups: [],
  };
  const stock = new Map((await db.select().from(items)).map((i) => [i.id, i]));
  const rows = await db
    .select()
    .from(recipeModifierGroups)
    .where(eq(recipeModifierGroups.recipeVersionId, v.id))
    .orderBy(asc(recipeModifierGroups.position));
  for (const row of rows) {
    const opts = await db
      .select({ binding: recipeModifierOptions, option: modifierOptions })
      .from(recipeModifierOptions)
      .innerJoin(
        modifierOptions,
        eq(modifierOptions.id, recipeModifierOptions.optionId),
      )
      .where(eq(recipeModifierOptions.recipeModifierGroupId, row.id))
      .orderBy(asc(modifierOptions.position));
    const options: ConfiguredOption[] = [];
    for (const { binding: b, option: o } of opts) {
      const components =
        b.mode === "override"
          ? await db
              .select()
              .from(recipeModifierOptionComponents)
              .where(
                eq(recipeModifierOptionComponents.recipeModifierOptionId, b.id),
              )
          : await db
              .select()
              .from(modifierOptionComponents)
              .where(eq(modifierOptionComponents.optionId, o.id));
      const prices = await db
        .select()
        .from(recipeModifierOptionPrices)
        .where(eq(recipeModifierOptionPrices.recipeModifierOptionId, b.id));
      options.push({
        id: b.id,
        optionId: o.id,
        key: o.key,
        name: o.name,
        kind: o.kind as ConfiguredOption["kind"],
        instruction: o.instruction,
        enabled: b.enabled,
        defaultCount: b.defaultCount,
        maxCount: b.maxCount,
        mode: b.mode as ConfiguredOption["mode"],
        components: components.map((c) => ({
          ...c,
          archived:
            !stock.get(c.itemId) ||
            !!stock.get(c.itemId)?.archivedAt ||
            stock.get(c.itemId)?.baseUnit !== c.baseUnit,
        })),
        prices: Object.fromEntries(prices.map((p) => [p.channel, p.surcharge])),
      });
    }
    config.groups.push({ ...row, options });
  }
  return config;
}
export async function saveBindings(
  tx: Tx,
  recipeVersionId: string,
  productId: string,
  bindings: BindingInput[],
  actor: Actor,
  previousVersionId?: string,
) {
  const channels = (
    await tx
      .select()
      .from(productPrices)
      .where(eq(productPrices.productId, productId))
  ).map((p) => p.channel as SaleChannel);
  const seen = new Set<string>();
  for (const [position, g] of bindings.entries()) {
    if (!!g.groupVersionId === !!g.draft)
      invalid("Elegí un grupo existente o un borrador nuevo.");
    let groupVersionId = g.groupVersionId;
    if (g.draft) {
      if (g.draft.id || g.draft.revision)
        invalid("La conversión solo crea grupos nuevos.");
      groupVersionId = (await publishGroup(tx, actor, g.draft)).versionId;
    }
    if (!groupVersionId) invalid("Falta el grupo.");

    const [v] = await tx
      .select()
      .from(modifierGroupVersions)
      .where(eq(modifierGroupVersions.id, groupVersionId!));
    if (!v) invalid("Grupo inexistente.");
    const [identity] = await tx
      .select()
      .from(modifierGroups)
      .where(eq(modifierGroups.id, v.groupId))
      .for("update");
    if (identity.archivedAt) {
      const assigned = previousVersionId
        ? await tx
            .select()
            .from(recipeModifierGroups)
            .where(
              and(
                eq(recipeModifierGroups.recipeVersionId, previousVersionId),
                eq(recipeModifierGroups.groupVersionId, v.id),
              ),
            )
        : [];
      if (!assigned.length) invalid("El grupo está archivado.");
    }
    if (seen.has(v.groupId)) invalid("No repitas el grupo.");
    seen.add(v.groupId);
    if (g.min > g.max) invalid("Límites inválidos.");
    const source = await tx
      .select()
      .from(modifierOptions)
      .where(eq(modifierOptions.groupVersionId, v.id));
    if (
      new Set(g.options.map((o) => o.optionId ?? o.optionKey)).size !==
      g.options.length
    )
      invalid("Opción duplicada.");
    const [row] = await tx
      .insert(recipeModifierGroups)
      .values({
        recipeVersionId,
        groupId: v.groupId,
        groupVersionId: v.id,
        name: g.name,
        min: g.min,
        max: g.max,
        factor: g.factor,
        position,
      })
      .returning();
    for (const b of g.options) {
      const option =
        source.find((o) =>
          b.optionId ? o.id === b.optionId : o.key === b.optionKey,
        ) ?? invalid("Opción ajena al grupo.");
      if (b.defaultCount > b.maxCount || (!b.enabled && b.defaultCount))
        invalid("Selección predeterminada inválida.");
      if (
        option.kind === "instruction" &&
        (b.mode === "override" || b.components.length)
      )
        invalid("Una instrucción no admite ingredientes.");
      if (b.mode === "inherit" && b.components.length)
        invalid("La composición heredada no admite reemplazos.");
      const [saved] = await tx
        .insert(recipeModifierOptions)
        .values({
          recipeVersionId,
          recipeModifierGroupId: row.id,
          groupVersionId: v.id,
          optionId: option.id,
          enabled: b.enabled,
          defaultCount: b.defaultCount,
          maxCount: b.maxCount,
          mode: b.mode,
        })
        .returning();
      if (
        new Set(b.components.map((c) => c.itemId)).size !== b.components.length
      )
        invalid("Insumo repetido.");
      for (const c of b.components) {
        const [i] = await tx
          .select()
          .from(items)
          .where(eq(items.id, c.itemId))
          .for("update");
        if (!i || i.archivedAt) invalid("Insumo no disponible.");
        if (c.baseUnit && c.baseUnit !== i.baseUnit)
          conflict("Cambió la unidad.");
        await tx.insert(recipeModifierOptionComponents).values({
          recipeModifierOptionId: saved.id,
          itemId: i.id,
          name: i.name,
          baseUnit: i.baseUnit,
          quantity: c.quantity,
        });
      }
      for (const channel of channels)
        if (b.enabled && b.prices[channel] == null)
          invalid("Completá el recargo en cada canal, incluso si es cero.");
      for (const [channel, surcharge] of Object.entries(b.prices))
        if (surcharge != null)
          await tx
            .insert(recipeModifierOptionPrices)
            .values({ recipeModifierOptionId: saved.id, channel, surcharge });
    }
  }
  // Hold every effective input until the publication transaction commits.
  const unlocked = await loadConfiguration(tx, recipeVersionId);
  const effective = unlocked.groups.flatMap((g) =>
    g.options.filter((o) => o.enabled).flatMap((o) => o.components),
  );
  for (const itemId of [...new Set(effective.map((c) => c.itemId))].sort()) {
    const [i] = await tx
      .select()
      .from(items)
      .where(eq(items.id, itemId))
      .for("update");
    if (
      !i ||
      i.archivedAt ||
      effective.some((c) => c.itemId === itemId && c.baseUnit !== i.baseUnit)
    )
      conflict("Un insumo cambió. Revisá la receta.");
  }
  const configuration = await loadConfiguration(tx, recipeVersionId);
  // Validate all enabled components, including options not selected by default.
  for (const g of configuration.groups)
    for (const o of g.options)
      if (o.enabled && o.components.some((c) => c.archived))
        invalid("Hay un insumo archivado o con unidad modificada.");
  for (const channel of channels.length ? channels : ["counter" as SaleChannel])
    resolveComposition(
      configuration,
      defaultSelections(configuration),
      channel,
    );
}
export async function getProductConfiguration(
  db: AppDb,
  actor: Actor,
  productId: string,
  channel: SaleChannel,
) {
  salesAccess(actor);
  return db.transaction(
    async (tx) => {
      const [p] = await tx
        .select()
        .from(products)
        .where(eq(products.id, productId));
      if (!p || p.archivedAt) notFound();
      const [price] = await tx
        .select()
        .from(productPrices)
        .where(
          and(
            eq(productPrices.productId, productId),
            eq(productPrices.channel, channel),
          ),
        );
      const [r] = await tx
        .select({ v: recipeVersions })
        .from(recipes)
        .innerJoin(
          recipeVersions,
          and(
            eq(recipeVersions.recipeId, recipes.id),
            eq(recipeVersions.version, recipes.revision),
          ),
        )
        .where(eq(recipes.productId, productId));
      if (!r)
        return {
          recipeVersionId: null,
          model: "unavailable",
          groups: [],
          basePrice: price?.amount ?? null,
        };
      const c = await loadConfiguration(tx, r.v.id);
      return {
        recipeVersionId: c.recipeVersionId,
        model: c.model,
        basePrice: price?.amount ?? null,
        groups: c.groups.map((g) => ({
          id: g.id,
          name: g.name,
          min: g.min,
          max: g.max,
          options: g.options
            .filter((o) => o.enabled)
            .map((o) => ({
              id: o.id,
              name: o.name,
              defaultCount: o.defaultCount,
              maxCount: o.maxCount,
              price: o.prices[channel] ?? null,
              available: !o.components.some((c) => c.archived),
            })),
        })),
      };
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}
export type PublicConfiguration = Awaited<
  ReturnType<typeof getProductConfiguration>
>;
