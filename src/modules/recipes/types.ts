export type RecipeKind = "product" | "preparation";
export type RecipeInput = {
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
    options: { ingredientId: string; quantity: string; baseUnit?: string }[];
  }[];
};
export type RecipeOption = {
  id: string;
  ingredientId: string;
  name: string;
  baseUnit: string;
  quantity: string;
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
