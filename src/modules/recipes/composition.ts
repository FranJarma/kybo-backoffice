import { AppError } from "@/lib/errors";
import {
  integer,
  SCALE,
  safeQuantity,
  exactDivision,
  cents,
} from "@/modules/inventory/decimal";
import type {
  Configuration,
  Selection,
  ResolvedComposition,
  Component,
} from "@/modules/modifiers/types";
import type { SaleChannel } from "@/modules/sales/types";
const fail = (message: string): never => {
  throw new AppError("VALIDATION", message, 400);
};
export function defaultSelections(config: Configuration): Selection[] {
  return config.groups.flatMap((g) =>
    g.options
      .filter((o) => o.enabled && o.defaultCount > 0)
      .map((o) => ({ recipeModifierOptionId: o.id, count: o.defaultCount })),
  );
}
export function resolveComposition(
  config: Configuration,
  selections: Selection[],
  channel?: SaleChannel,
): ResolvedComposition {
  const chosen = new Map<string, number>();
  for (const s of selections) {
    if (
      chosen.has(s.recipeModifierOptionId) ||
      !Number.isSafeInteger(s.count) ||
      s.count < 0
    )
      fail("Selección inválida.");
    chosen.set(s.recipeModifierOptionId, s.count);
  }
  const components = new Map<string, Component>();
  const add = (c: Component, q: bigint) => {
    if (c.archived && channel !== undefined)
      fail("La composición contiene un insumo archivado.");
    if (q < 0n) fail("Cantidad inválida.");
    if (q === 0n) return;
    const previous = components.get(c.itemId);
    if (previous && previous.baseUnit !== c.baseUnit)
      fail("Unidades incompatibles.");
    components.set(c.itemId, {
      ...c,
      quantity: safeQuantity(q + (previous ? integer(previous.quantity) : 0n)),
    });
  };
  for (const c of config.fixed)
    add(
      c,
      exactDivision(integer(c.quantity) * SCALE, integer(config.yieldQuantity)),
    );
  const modifiers: ResolvedComposition["modifiers"] = [];
  let surcharge = 0n;
  for (const g of config.groups) {
    let count = 0;
    for (const o of g.options) {
      const n = chosen.get(o.id) ?? 0;
      chosen.delete(o.id);
      if (!n) continue;
      if (!o.enabled || n > o.maxCount)
        fail("Opción no habilitada o cantidad excedida.");
      count += n;
      const price =
        channel === undefined
          ? "0.00"
          : (o.prices[channel] ?? fail("Sin precio para este canal."));
      if (
        o.kind === "instruction" &&
        (o.components.length || o.mode === "override")
      )
        fail("Una instrucción no lleva ingredientes.");
      const amount = integer(price);
      if (amount < 0n) fail("Recargo inválido.");
      surcharge += amount * BigInt(n);
      for (const c of o.components)
        add(
          c,
          (o.mode === "inherit"
            ? exactDivision(integer(c.quantity) * integer(g.factor), SCALE)
            : integer(c.quantity)) * BigInt(n),
        );
      modifiers.push({
        recipeModifierOptionId: o.id,
        groupName: g.name,
        optionName: o.name,
        count: n,
        instruction: o.instruction,
        unitSurcharge: price,
      });
    }
    if (count < g.min || count > g.max)
      fail(`Revisá las cantidades de ${g.name}.`);
  }
  if (chosen.size) fail("La opción no pertenece a esta receta.");
  if (surcharge >= 10n ** 14n) fail("El recargo excede el límite.");
  return {
    components: [...components.values()],
    modifiers,
    surcharge: cents(surcharge),
  };
}
