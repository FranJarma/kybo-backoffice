import { requireCatalogManagement } from "../branches/context";
import {
  exactDivision,
  integer,
  SCALE,
  six,
} from "@/modules/inventory/decimal";
import type { AppDb } from "@/db/client";
import type { Actor } from "@/lib/access";
import { conflict, invalid, type Tx } from "@/modules/inventory/service";
import { recipeDefinition } from "./service";
export async function proposeConversion(
  db: AppDb | Tx,
  actor: Actor,
  recipeId: string,
  revision: number,
) {
  await requireCatalogManagement(db, actor);
  const r = await recipeDefinition(db, recipeId);
  if (r.revision !== revision) conflict("La receta cambió.");
  if (r.kind !== "product" || r.compositionModel !== "legacy")
    invalid("Esta receta no requiere conversión.");
  const perUnit = (quantity: string) =>
    six(exactDivision(integer(quantity) * SCALE, integer(r.yieldQuantity)));
  return {
    recipeId,
    revision,
    fixed: r.lines
      .filter((l) => !l.optional && l.options.length === 1)
      .map((l) => ({
        ...l,
        options: l.options.map((o) => ({
          ...o,
          quantity: perUnit(o.quantity),
          wastePercent: o.wastePercent,
        })),
      })),
    groups: r.lines
      .filter((l) => l.optional || l.options.length > 1)
      .map((l, i) => ({
        name: `Elegí ${i + 1}`,
        min: l.optional ? 0 : 1,
        max: 1,
        factor: "1",
        options: l.options.map((o, j) => ({
          key: o.id,
          name: o.name,
          kind: "composition" as const,
          defaultCount: j === 0 ? 1 : 0,
          maxCount: 1,
          prices: {},
          components: [
            {
              itemId: o.itemId,
              name: o.name,
              itemClass: o.itemClass,
              baseUnit: o.baseUnit,
              quantity: perUnit(o.quantity),
              wastePercent: o.wastePercent,
            },
          ],
        })),
      })),
  };
}
export type ConversionDraft = Awaited<ReturnType<typeof proposeConversion>>;
