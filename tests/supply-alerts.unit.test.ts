import { expect, it } from "vitest";
import { projectSupply, dayStart } from "@/modules/supply-alerts/engine";
import type { SupplyPolicy } from "@/modules/supply-alerts/types";
const policy: SupplyPolicy = {
  id: "p",
  revision: 1,
  itemId: "cups",
  itemName: "Vasos",
  baseUnit: "unit",
  dailyConsumption: "150.000000",
  leadDays: 7,
  safetyDays: 3,
  targetDays: 17,
  enabled: true,
};
const project = (quantity: string, change: Partial<SupplyPolicy> = {}) =>
  projectSupply(
    { ...policy, ...change },
    [{ id: "lot", quantity, expiresOn: null }],
    "2026-10-23",
  );
it.each([
  ["1050.000000", "critical", "7.000000"],
  ["1051.000000", "high", "7.006666"],
  ["1500.000000", "high", "10.000000"],
  ["1501.000000", "scheduled", "10.006666"],
])(
  "classifies exact 7/10 day boundaries using received usable stock %s",
  (q, urgency, days) => {
    expect(project(q)).toMatchObject({ urgency, coverageDays: days });
  },
);
it("proposes 1050 cups to reach 17 days and sets today's purchase deadline at 10-day coverage", () => {
  expect(project("1500.000000")).toMatchObject({
    suggestedQuantity: "1050.000000",
    orderBy: "2026-10-23",
    riskOn: "2026-11-02",
    status: "action",
  });
  expect(project("2550.000000")).toMatchObject({
    suggestedQuantity: "0.000000",
    status: "covered",
    urgency: null,
  });
});
it("expires before consuming on that date, rather than promising the entire opening stock", () => {
  const result = projectSupply(
    policy,
    [{ id: "soon", quantity: "10000.000000", expiresOn: "2026-10-25" }],
    "2026-10-23",
  );
  expect(result).toMatchObject({
    coverageDays: "2.000000",
    urgency: "critical",
    suggestedQuantity: "2250.000000",
  });
});
it("uses FEFO regardless of input ordering and ignores already expired stock", () => {
  const lots = [
    { id: "later", quantity: "1000.000000", expiresOn: null },
    { id: "soon", quantity: "300.000000", expiresOn: "2026-10-25" },
    { id: "expired", quantity: "500.000000", expiresOn: "2026-10-23" },
  ];
  expect(projectSupply(policy, lots, "2026-10-23")).toMatchObject({
    availableQuantity: "1300.000000",
    suggestedQuantity: "1250.000000",
  });
});
it("distinguishes missing consumption from explicit zero, and never invents infinite coverage", () => {
  expect(project("1500.000000", { dailyConsumption: null })).toMatchObject({
    status: "needs_estimate",
    coverageDays: null,
    urgency: "high",
  });
  expect(
    project("1500.000000", { dailyConsumption: "0.000000" }),
  ).toMatchObject({
    status: "no_consumption",
    coverageDays: null,
    urgency: null,
  });
});
it("rounds indivisible units up and caps the reported projection horizon", () => {
  expect(
    project("0.000000", { dailyConsumption: "0.100001" }).suggestedQuantity,
  ).toBe("2.000000");
  expect(project("100000000000.000000")).toMatchObject({
    coverageAtLeast: true,
    coverageDays: "365.000000",
    status: "covered",
  });
});
it("anchors deadlines to the selected branch's calendar date", () => {
  expect(
    dayStart("2026-10-23", "America/Argentina/Buenos_Aires").toISOString(),
  ).toBe("2026-10-23T03:00:00.000Z");
  expect(dayStart("2026-10-23", "Asia/Tokyo").toISOString()).toBe(
    "2026-10-22T15:00:00.000Z",
  );
});
