import type { ComponentProps } from "react";
import { inputDecimal } from "@/components/recipes/shared";
import type { PublicConfiguration } from "@/modules/recipes/configuration";
import type { SaleLookup } from "@/modules/sales/types";
import { appendCartLine, newCartLine, type CartLine } from "./cart";
import type {
  ComboConfigurator,
  ComboSaleConfiguration,
} from "./combo-configurator";
import type { ProductConfigurator } from "./product-configurator";

export type OrderConfiguration = {
  row: SaleLookup["rows"][number];
  config: PublicConfiguration | ComboSaleConfiguration;
  index?: number;
};

type ProductSelection = Parameters<
  ComponentProps<typeof ProductConfigurator>["onConfirm"]
>[0];
type ComboSelection = Parameters<
  ComponentProps<typeof ComboConfigurator>["onConfirm"]
>[0];

export type ConfirmedConfiguration = Pick<
  CartLine,
  | "configurable"
  | "expectedPrice"
  | "price"
  | "priceReason"
  | "expectedPricingRevision"
  | "expectedFulfillmentVersionId"
  | "expectedRecipeVersionId"
  | "expectedComboVersionId"
  | "modifiers"
  | "modifierLabels"
  | "comboChoices"
>;

export function confirmedProductConfiguration(
  config: PublicConfiguration,
  selection: ProductSelection,
): ConfirmedConfiguration {
  return {
    expectedRecipeVersionId: selection.expectedRecipeVersionId,
    modifiers: selection.modifiers,
    modifierLabels: selection.modifierLabels,
    expectedPrice: selection.expectedPrice,
    expectedPricingRevision: config.pricingRevision,
    expectedFulfillmentVersionId: config.fulfillmentVersionId ?? undefined,
    configurable: config.groups.length > 0,
    price: inputDecimal(selection.expectedPrice),
    priceReason: "",
  };
}

export function confirmedComboConfiguration(
  config: ComboSaleConfiguration,
  selection: ComboSelection,
): ConfirmedConfiguration {
  return {
    ...selection,
    expectedPricingRevision: config.pricingRevision,
    configurable: true,
    expectedFulfillmentVersionId: undefined,
    expectedRecipeVersionId: undefined,
    modifiers: [],
    price: inputDecimal(selection.expectedPrice),
    priceReason: "",
  };
}

export function saveConfiguredLine(
  lines: CartLine[],
  { row, index }: Pick<OrderConfiguration, "row" | "index">,
  configuration: ConfirmedConfiguration,
): CartLine[] {
  if (index === undefined)
    return appendCartLine(lines, { ...newCartLine(row), ...configuration });

  if (lines[index]?.productId !== row.id) return lines;

  const updated = { ...lines[index], ...configuration };
  return lines.map((line, position) => (position === index ? updated : line));
}
