export type ProductionInput = {
  locationId: string;
  recipeId: string;
  revision: number;
  multiplier: string;
  actualOutput: string;
  producedOn: string;
  expiresOn?: string | null;
  lotCode?: string | null;
  notes?: string | null;
  selections: { lineId: string; optionId: string | null; quantity: string }[];
};
export type ProductionOperation = ProductionInput & {
  requestId: string;
  previewToken: string;
};
export type ProductionPreview = {
  token: string;
  canConfirm: boolean;
  businessDate: string;
  expectedOutput: string;
  actualOutput: string;
  yieldDifference: string;
  totalCost: string | null;
  unitCost: string | null;
  missingCosts: string[];
  earliestExpiry: string | null;
  items: {
    itemId: string;
    name: string;
    baseUnit: string;
    needed: string;
    usable: string;
    shortfall: string;
  }[];
};
export type BatchSummary = {
  id: string;
  recipeVersionId: string;
  outputItemId: string;
  outputName: string;
  baseUnit: string;
  outputLotId: string;
  multiplier: string;
  expectedOutput: string;
  actualOutput: string;
  totalCost: string | null;
  unitCost: string | null;
  producedOn: string;
  expiresOn: string | null;
  lotCode: string | null;
  notes: string | null;
  actorId: string;
  actorName: string;
  createdAt: string;
};
export type BatchDetail = BatchSummary & {
  recipeId: string;
  recipeRevision: number;
  selections: { lineId: string; optionId: string | null; quantity: string }[];
  allocations: {
    itemId: string;
    lotId: string;
    itemName: string;
    baseUnit: string;
    quantity: string;
    totalCost: string | null;
    unitCost: string | null;
  }[];
};
