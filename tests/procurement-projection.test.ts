import { expect, it } from "vitest";
import { projectSupply } from "@/modules/supply-alerts/engine";
import type { SupplyPolicy } from "@/modules/supply-alerts/types";
const policy: SupplyPolicy = {
  id: "p",
  revision: 1,
  itemId: "cups",
  itemName: "Vasos",
  baseUnit: "unit",
  dailyConsumption: "100.000000",
  leadDays: 7,
  safetyDays: 3,
  targetDays: 17,
  enabled: true,
};
const run = (
  stock: string,
  expectedOn: string | null,
  quantity = "1200.000000",
) =>
  projectSupply(
    policy,
    [{ id: "stock", quantity: stock, expiresOn: null }],
    "2026-10-23",
    [{ id: "order", quantity, expectedOn }],
  );
it("counts timely pending orders without changing physical coverage", () => {
  expect(run("1000.000000", "2026-10-28")).toMatchObject({
    availableQuantity: "1000.000000",
    coverageDays: "10.000000",
    projectedCoverageDays: "22.000000",
    incomingQuantity: "1200.000000",
    suggestedQuantity: "0.000000",
    status: "covered",
  });
});
it("keeps an earlier shortage visible even if a large order arrives later", () => {
  expect(run("500.000000", "2026-10-30", "5000.000000")).toMatchObject({
    projectedCoverageDays: "5.000000",
    riskOn: "2026-10-28",
    suggestedQuantity: "300.000000",
    urgency: "critical",
    status: "action",
  });
});
it("puts an ETA without a time at the end of that day", () => {
  expect(run("500.000000", "2026-10-28")).toMatchObject({
    suggestedQuantity: "100.000000",
    projectedCoverageDays: "5.000000",
  });
  expect(run("500.000000", "2026-10-27")).toMatchObject({
    suggestedQuantity: "0.000000",
    projectedCoverageDays: "17.000000",
  });
});
it("does not promise coverage for overdue or undated orders", () => {
  for (const eta of [null, "2026-10-22"])
    expect(run("1000.000000", eta)).toMatchObject({
      suggestedQuantity: "700.000000",
      incomingQuantity: "0.000000",
      unconfirmedIncomingQuantity: "1200.000000",
    });
});
