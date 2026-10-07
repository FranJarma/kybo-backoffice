import type { SaleChannel } from "@/modules/sales/types";
export type Component = {
  itemId: string;
  name: string;
  baseUnit: string;
  quantity: string;
  archived: boolean;
};
export type Selection = { recipeModifierOptionId: string; count: number };
export type ConfiguredOption = {
  id: string;
  optionId?: string;
  key: string;
  name: string;
  kind: "composition" | "instruction";
  instruction: string | null;
  enabled: boolean;
  defaultCount: number;
  maxCount: number;
  mode: "inherit" | "override";
  components: Component[];
  prices: Partial<Record<SaleChannel, string>>;
};
export type ConfiguredGroup = {
  groupId?: string;
  id: string;
  groupVersionId: string;
  name: string;
  min: number;
  max: number;
  factor: string;
  options: ConfiguredOption[];
};
export type Configuration = {
  recipeVersionId: string;
  revision: number;
  model: "legacy" | "configurable";
  yieldQuantity: string;
  fixed: Component[];
  groups: ConfiguredGroup[];
};
export type ResolvedModifier = {
  recipeModifierOptionId: string;
  groupName: string;
  optionName: string;
  count: number;
  instruction: string | null;
  unitSurcharge: string;
};
export type ResolvedComposition = {
  components: Component[];
  modifiers: ResolvedModifier[];
  surcharge: string;
};
export type CompositionCost = {
  totalCost: string | null;
  knownSubtotal: string;
  missing: string[];
  components: { itemId: string; cost: string | null }[];
};
