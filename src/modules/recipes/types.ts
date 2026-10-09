export type RecipeKind = "product" | "preparation";
export type RecipeInput = {
  compositionModel?: "legacy" | "configurable";
  groups?: unknown[];
  requestId: string;
  id?: string;
  revision?: number;
  kind: RecipeKind;
  targetId: string;
  targetUnit?: string;
  yieldQuantity: string;
  notes?: string | null;
  lines: {
    optional?: boolean;
    options: {
      itemId: string;
      quantity: string;
      wastePercent?: string;
      baseUnit?: string;
    }[];
  }[];
};
export type RecipeOption = {
  itemClass?: string;
  id: string;
  itemId: string;
  name: string;
  baseUnit: string;
  quantity: string;
  wastePercent?: string;
  archived: boolean;
  unitCost: string | null;
};
export type RecipeLine = {
  id: string;
  optional: boolean;
  options: RecipeOption[];
};
export type CostResult = {
  totalCost: string | null;
  unitCost: string | null;
  missing: string[];
  lines: { lineId: string; optionId: string | null; cost: string | null }[];
};
export type RecipeSummary = {
  id: string;
  kind: RecipeKind;
  targetId: string;
  name: string;
  baseUnit: string;
  revision: number;
  yieldQuantity: string;
  archived: boolean;
};
export type RecipeDetail = RecipeSummary & {
  compositionModel: "legacy" | "configurable";
  configuration?: import("@/modules/modifiers/types").Configuration;
  versionId: string;
  notes: string | null;
  lines: RecipeLine[];
  cost: CostResult;
  versions: { id: string; version: number; createdAt: string }[];
};
export type RecipeList = {
  rows: (RecipeSummary & {
    unitCost: string | null;
    priceCounter: string | null;
  })[];
  total: number;
};
