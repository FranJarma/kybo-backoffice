import { expect, it } from "vitest";
import {
  summarizeExpenses,
  allocateOverhead,
} from "@/modules/overheads/calculation";
const line = (budget: string | null, actual: string | null) => ({
  category: "rent" as const,
  concept: "Alquiler",
  budget,
  actual,
  notes: "",
});
it("separates monthly budget and actual rates using original totals", () => {
  const s = summarizeExpenses([line("2000000.00", "2100000.00")], 4000, 3500);
  expect(s).toMatchObject({
    budgetTotal: "2000000.00",
    actualTotal: "2100000.00",
    budgetRate: "500.000000",
    actualRate: "600.000000",
  });
});
it("keeps missing values distinct from confirmed zero and avoids division by zero", () => {
  expect(summarizeExpenses([], 4000, 0).budgetRate).toBeNull();
  expect(summarizeExpenses([line(null, "0.00")], 4000, 0)).toMatchObject({
    budgetRate: null,
    actualRate: null,
    budgetPending: 1,
    actualPending: 0,
  });
  expect(summarizeExpenses([line("0.00", "0.00")], 1, 1).budgetRate).toBe(
    "0.000000",
  );
  expect(
    summarizeExpenses([line("10.00", "10.00")], null, 1).budgetRate,
  ).toBeNull();
});
it("multiplies original ratios before rounding, preserving combo quantities", () => {
  expect(allocateOverhead("1.00", 3, 3)).toBe("1.000000");
  expect(allocateOverhead("1.00", 3, 1)).toBe("0.333333");
  expect(allocateOverhead(null, 3, 2)).toBeNull();
  expect(allocateOverhead("1.00", 0, 2)).toBeNull();
});
