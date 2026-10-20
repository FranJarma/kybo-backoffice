import type { CartLine } from "./cart";
import type { PublicConfiguration } from "@/modules/recipes/configuration";
import type { LineInput } from "@/modules/sales/validation";
import type { Selection } from "@/modules/modifiers/types";
import type { SaleLookup } from "@/modules/sales/types";
import { decimal } from "@/modules/inventory/decimal";
const selectionKey = (selections?: Selection[]) =>
  selections === undefined
    ? null
    : selections
        .map((s) => [s.recipeModifierOptionId, s.count])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
function lineKey(line: CartLine): string | null {
  try {
    return JSON.stringify([
      line.productId,
      line.expectedPricingRevision ?? null,
      line.expectedFulfillmentVersionId ?? null,
      line.expectedRecipeVersionId ?? null,
      line.expectedComboVersionId ?? null,
      decimal(line.price, 2),
      line.expectedPrice,
      line.priceReason,
      line.notes,
      selectionKey(line.modifiers),
      line.comboChoices
        ?.map((c) => [
          c.groupId,
          c.optionId,
          c.expectedFulfillmentVersionId,
          c.expectedRecipeVersionId ?? null,
          selectionKey(c.modifiers),
        ])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0]))) ?? null,
    ]);
  } catch {
    return null;
  }
}
/** Merge only the exact same physical/configured item; never discard quantity at limits. */
export function appendCartLine(
  current: CartLine[],
  incoming: CartLine,
): CartLine[] {
  if (
    !Number.isInteger(incoming.quantity) ||
    incoming.quantity < 1 ||
    incoming.quantity > 999
  )
    return current;
  const key = lineKey(incoming);
  const index =
    key === null ? -1 : current.findIndex((line) => lineKey(line) === key);
  if (index >= 0) {
    if (current[index].quantity + incoming.quantity > 999) return current;
    return current.map((line, i) =>
      i === index
        ? { ...line, quantity: line.quantity + incoming.quantity }
        : line,
    );
  }
  return current.length >= 50 ? current : [...current, incoming];
}
const normalizeSearch = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es");
export function filterCatalogue(
  rows: SaleLookup["rows"],
  query: string,
  category: string,
): SaleLookup["rows"] {
  const q = normalizeSearch(query.trim());
  return rows.filter(
    (row) =>
      (!category ||
        (category === "none"
          ? !row.categoryId
          : row.categoryId === category)) &&
      (!q ||
        normalizeSearch(`${row.name} ${row.description ?? ""}`).includes(q) ||
        row.id === query),
  );
}
export type ComboTouchSelection = {
  choice: NonNullable<LineInput["comboChoices"]>[number];
  extra: string;
  labels: string[];
};
export function simpleComboSelection(
  groupId: string,
  optionId: string,
  config: PublicConfiguration,
): ComboTouchSelection | null {
  if (config.groups.length || !config.fulfillmentVersionId) return null;
  return {
    choice: {
      groupId,
      optionId,
      expectedFulfillmentVersionId: config.fulfillmentVersionId,
      expectedRecipeVersionId: config.recipeVersionId,
      modifiers: [],
    },
    extra: "0.00",
    labels: [],
  };
}
