import { expect, it } from "vitest";
import { projectSupply } from "@/modules/supply-alerts/engine";
import {
  purchaseSeed,
  purchaseTiming,
  purchaseAlerts,
} from "@/modules/supply-alerts/presentation";
import { supplySuggestions } from "@/modules/supply-alerts/suggestions";
import type { SupplySnapshot } from "@/modules/supply-alerts/types";
const policy = {
  id: "policy",
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
const alert = projectSupply(
  policy,
  [{ id: "lot", quantity: "1500.000000", expiresOn: null }],
  "2026-10-23",
);
it("preloads exact base amounts and excludes covered, disabled or missing consumption", () => {
  const covered = projectSupply(
    { ...policy, itemId: "covered" },
    [{ id: "full", quantity: "3000.000000", expiresOn: null }],
    "2026-10-23",
  );
  const missing = projectSupply(
    { ...policy, itemId: "missing", dailyConsumption: null },
    [],
    "2026-10-23",
  );
  expect(
    purchaseSeed([
      alert,
      covered,
      missing,
      { ...alert, enabled: false, itemId: "off" },
    ]),
  ).toEqual([
    {
      itemId: "cups",
      itemName: "Vasos",
      baseUnit: "unit",
      quantity: "1050.000000",
      leadDays: 7,
    },
  ]);
  expect(
    purchaseSeed([
      { ...alert, baseUnit: "g", suggestedQuantity: "4657.894744" },
    ])[0].quantity,
  ).toBe("4657.894744");
});
it("sorts urgency and dates without mutating the forecast", () => {
  const critical = {
    ...alert,
    itemId: "critical",
    urgency: "critical" as const,
    orderBy: "2026-10-20",
  };
  const input = [alert, critical];
  expect(purchaseAlerts(input).map((a) => a.itemId)).toEqual([
    "critical",
    "cups",
  ]);
  expect(input[0]).toBe(alert);
});
it("uses calendar deadlines rather than end-of-day times", () => {
  expect(purchaseTiming("2026-10-23", "2026-10-23")).toBe("Pedir hoy");
  expect(purchaseTiming("2026-10-22", "2026-10-23")).toBe("Pedir cuanto antes");
  expect(purchaseTiming("2026-10-24", "2026-10-23")).toBe("Pedir el 24/10");
});
it("keeps task keys but removes country-specific naming", () => {
  const snapshot: SupplySnapshot = {
    available: true,
    asOf: "2026-10-23T12:00:00Z",
    items: [],
    policies: [policy],
    alerts: [alert],
  };
  expect(
    supplySuggestions(snapshot, "America/Argentina/Buenos_Aires")[0],
  ).toMatchObject({ needKey: "supply:cups", title: "Comprar Vasos" });
  expect(
    supplySuggestions(snapshot, "America/Argentina/Buenos_Aires")[0].reason,
  ).not.toContain("Bolivia");
});
