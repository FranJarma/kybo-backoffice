import type { SaleChannel } from "@/modules/sales/types";
import type { ExpenseEntry } from "./types";

export type BreakEvenSnapshot = {
  branchId: string;
  branchName: string;
  month: string;
  asOf: string;
  expenseRevision: number | null;
  budget: {
    total: string | null;
    expectedUnits: number | null;
    rate: string | null;
    pending: number;
    entries: ExpenseEntry[];
  };
  methods: { id: string; name: string; percent: string | null }[];
  historicalMix: { productId: string; quantity: number }[];
  historicalUnits: number;
  historicalExcludedUnits: number;
  warnings: string[];
  products: {
    id: string;
    name: string;
    kind: "individual" | "combo";
    finalUnits: number | null;
    labels: string[];
    pendingReasons: string[];
    estimates: {
      channel: SaleChannel;
      price: string | null;
      netPrice: string | null;
      cost: string | null;
      vat: string | null;
      iibb: string | null;
      methods: {
        id: string;
        commission: string | null;
        contribution: string | null;
      }[];
    }[];
  }[];
};

export type BreakEvenScenario = {
  channel: SaleChannel;
  methodId: string;
  entries: { productId: string; quantity: number }[];
  expectedUnits: number | null;
  daysOpen: number | null;
};

export type BreakEvenResult = {
  status: "ready" | "missing_mix" | "pending" | "non_positive";
  selectedUnits: number;
  averageContribution: string | null;
  breakEvenUnits: number | null;
  breakEvenPerDay: number | null;
  projectedContribution: string | null;
  projectedProfit: string | null;
  blockers: string[];
  products: {
    productId: string;
    finalUnits: number | null;
    price: string | null;
    cost: string | null;
    commission: string | null;
    iibb: string | null;
    contribution: string | null;
    allocatedOverhead: string | null;
    projectedMargin: string | null;
    breakEvenSales: number | null;
    breakEvenUnits: number | null;
    status: "ready" | "pending" | "non_positive";
    pendingReasons: string[];
  }[];
};
