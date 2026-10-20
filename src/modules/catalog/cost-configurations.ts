import { asc, eq, inArray } from "drizzle-orm";
import type { AppDb } from "@/db/client";
import type { Tx } from "@/db/types";
import { items } from "@/db/business-schema";
import { recipeLines, recipeOptions, recipeVersions } from "@/db/recipe-schema";
import {
  recipeModifierGroups,
  recipeModifierOptions,
  modifierOptions,
  modifierOptionComponents,
  recipeModifierOptionComponents,
  recipeModifierOptionPrices,
} from "@/db/modifier-schema";
import type { Component, Configuration } from "@/modules/modifiers/types";
import { consumptionQuantity } from "@/modules/recipes/waste";
import { integer, SCALE } from "@/modules/inventory/decimal";

type Version = Pick<
  typeof recipeVersions.$inferSelect,
  "id" | "version" | "compositionModel" | "yieldQuantity"
>;

function byKey<T>(rows: T[], key: (row: T) => string) {
  const result = new Map<string, T[]>();
  for (const row of rows) {
    const id = key(row);
    const bucket = result.get(id) ?? [];
    bucket.push(row);
    result.set(id, bucket);
  }
  return result;
}

/** Cost-only read model: published versions in bulk, without editor/history data. */
export async function costConfigurations(
  db: AppDb | Tx,
  versions: Version[],
  withPrices = false,
): Promise<Map<string, Configuration>> {
  if (!versions.length) return new Map();
  const ids = versions.map((version) => version.id);
  const fixedRows = await db
    .select({
      line: recipeLines,
      option: recipeOptions,
      itemClass: items.class,
      archivedAt: items.archivedAt,
    })
    .from(recipeLines)
    .innerJoin(recipeOptions, eq(recipeOptions.lineId, recipeLines.id))
    .innerJoin(items, eq(items.id, recipeOptions.itemId))
    .where(inArray(recipeLines.versionId, ids))
    .orderBy(asc(recipeLines.position), asc(recipeOptions.position));
  const configurable = versions
    .filter((v) => v.compositionModel === "configurable")
    .map((v) => v.id);
  const groups = configurable.length
    ? await db
        .select()
        .from(recipeModifierGroups)
        .where(inArray(recipeModifierGroups.recipeVersionId, configurable))
        .orderBy(asc(recipeModifierGroups.position))
    : [];
  const bindings = groups.length
    ? await db
        .select({ binding: recipeModifierOptions, option: modifierOptions })
        .from(recipeModifierOptions)
        .innerJoin(
          modifierOptions,
          eq(modifierOptions.id, recipeModifierOptions.optionId),
        )
        .where(inArray(recipeModifierOptions.recipeVersionId, configurable))
        .orderBy(asc(modifierOptions.position))
    : [];
  const inheritedIds = [
    ...new Set(
      bindings
        .filter((b) => b.binding.mode !== "override")
        .map((b) => b.option.id),
    ),
  ];
  const overrideIds = bindings
    .filter((b) => b.binding.mode === "override")
    .map((b) => b.binding.id);
  const inherited = inheritedIds.length
    ? await db
        .select({
          component: modifierOptionComponents,
          itemId: items.id,
          itemClass: items.class,
          currentUnit: items.baseUnit,
          archivedAt: items.archivedAt,
        })
        .from(modifierOptionComponents)
        .leftJoin(items, eq(items.id, modifierOptionComponents.itemId))
        .where(inArray(modifierOptionComponents.optionId, inheritedIds))
    : [];
  const overrides = overrideIds.length
    ? await db
        .select({
          component: recipeModifierOptionComponents,
          itemId: items.id,
          itemClass: items.class,
          currentUnit: items.baseUnit,
          archivedAt: items.archivedAt,
        })
        .from(recipeModifierOptionComponents)
        .leftJoin(items, eq(items.id, recipeModifierOptionComponents.itemId))
        .where(
          inArray(
            recipeModifierOptionComponents.recipeModifierOptionId,
            overrideIds,
          ),
        )
    : [];
  const prices =
    withPrices && bindings.length
      ? await db
          .select()
          .from(recipeModifierOptionPrices)
          .where(
            inArray(
              recipeModifierOptionPrices.recipeModifierOptionId,
              bindings.map((b) => b.binding.id),
            ),
          )
      : [];
  const fixedByVersion = byKey(fixedRows, (row) => row.line.versionId);
  const groupsByVersion = byKey(groups, (row) => row.recipeVersionId);
  const optionsByGroup = byKey(
    bindings,
    (row) => row.binding.recipeModifierGroupId,
  );
  const inheritedByOption = byKey(inherited, (row) => row.component.optionId);
  const overridesByOption = byKey(
    overrides,
    (row) => row.component.recipeModifierOptionId,
  );
  const pricesByOption = byKey(prices, (row) => row.recipeModifierOptionId);

  const result = new Map<string, Configuration>();
  for (const version of versions) {
    const lines = [
      ...byKey(
        fixedByVersion.get(version.id) ?? [],
        (row) => row.line.id,
      ).values(),
    ].map((entries) => ({
      ...entries[0].line,
      options: entries.map(({ option, itemClass, archivedAt }) => ({
        id: option.id,
        itemId: option.itemId,
        name: option.itemName,
        baseUnit: option.baseUnit,
        quantity: option.quantity,
        wastePercent: option.wastePercent,
        itemClass,
        archived: !!archivedAt,
      })),
    }));
    const config: Configuration = {
      recipeVersionId: version.id,
      revision: version.version,
      model: version.compositionModel as Configuration["model"],
      yieldQuantity: version.yieldQuantity,
      fixed: [],
      groups: [],
    };
    if (config.model === "legacy") {
      config.fixed = lines
        .filter((line) => !line.optional && line.options.length === 1)
        .map((line) => line.options[0]);
      config.groups = lines
        .filter((line) => line.optional || line.options.length > 1)
        .map((line, i) => ({
          id: line.id,
          name: `Alternativas ${i + 1}`,
          groupVersionId: line.id,
          min: line.optional ? 0 : 1,
          max: 1,
          factor: "1.000000",
          options: line.options.map((option, j) => ({
            ...option,
            key: option.id,
            kind: "composition",
            instruction: null,
            enabled: true,
            defaultCount: j === 0 ? 1 : 0,
            maxCount: 1,
            mode: "override",
            components: [
              {
                ...option,
                quantity: consumptionQuantity(
                  option.quantity,
                  option.wastePercent,
                  SCALE,
                  integer(version.yieldQuantity),
                ),
                wastePercent: "0.00",
              },
            ],
            prices: {},
          })),
        }));
    } else {
      config.fixed = lines.map((line) => line.options[0]);
      config.groups = (groupsByVersion.get(version.id) ?? []).map((group) => ({
        ...group,
        options: (optionsByGroup.get(group.id) ?? []).map(
          ({ binding, option }) => {
            const components =
              binding.mode === "override"
                ? (overridesByOption.get(binding.id) ?? [])
                : (inheritedByOption.get(option.id) ?? []);
            return {
              id: binding.id,
              optionId: option.id,
              key: option.key,
              name: option.name,
              kind: option.kind as "composition" | "instruction",
              instruction: option.instruction,
              enabled: binding.enabled,
              defaultCount: binding.defaultCount,
              maxCount: binding.maxCount,
              mode: binding.mode as "inherit" | "override",
              components: components.map((row): Component => ({
                ...row.component,
                itemClass: row.itemClass ?? undefined,
                archived:
                  !row.itemId ||
                  !!row.archivedAt ||
                  row.currentUnit !== row.component.baseUnit,
              })),
              prices: Object.fromEntries(
                (pricesByOption.get(binding.id) ?? []).map((p) => [
                  p.channel,
                  p.surcharge,
                ]),
              ),
            };
          },
        ),
      }));
    }
    result.set(version.id, config);
  }
  return result;
}
