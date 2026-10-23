import type { Urgency } from "../daily-operations/types";
export type SupplyPolicy = {
  id: string;
  revision: number;
  itemId: string;
  itemName: string;
  baseUnit: string;
  dailyConsumption: string | null;
  leadDays: number;
  safetyDays: number;
  targetDays: number;
  enabled: boolean;
};
export type SupplyLot = {
  id: string;
  quantity: string;
  expiresOn: string | null;
};
export type SupplyAlert = SupplyPolicy & {
  availableQuantity: string;
  suggestedQuantity: string;
  coverageDays: string | null;
  coverageAtLeast: boolean;
  riskOn: string | null;
  orderBy: string | null;
  urgency: Urgency | null;
  status: "needs_estimate" | "no_consumption" | "covered" | "action";
};
export type SupplySnapshot = {
  available: boolean;
  asOf: string;
  policies: SupplyPolicy[];
  alerts: SupplyAlert[];
  items: { id: string; name: string; baseUnit: string }[];
};
