import { expect, it } from "vitest";
import { buildDailySuggestions } from "@/modules/daily-operations/suggestions";
import type { ReplenishmentSnapshot } from "@/modules/replenishment/types";
it("does not export stock needed by the source or hide shortages with reciprocal transfers", () => {
  const policies = ["a", "b"].map((id) => ({
    id,
    revision: 1,
    itemId: "milk",
    itemName: "Leche",
    baseUnit: "ml",
    locationId: id,
    locationName: id,
    minimumQuantity: "5.000000",
    targetQuantity: "10.000000",
    preparationMinutes: null,
    enabled: true,
  }));
  const snapshot: ReplenishmentSnapshot = {
    asOf: "2026-10-22",
    items: [],
    locations: [],
    policies,
    alerts: policies.map((p) => ({
      ...p,
      kind: "transfer",
      severity: "low",
      availableQuantity: "5.000000",
      suggestedQuantity: "5.000000",
      sources: [
        {
          locationId: p.id === "a" ? "b" : "a",
          locationName: "source",
          availableQuantity: "5.000000",
        },
      ],
      activeProduction: [],
    })),
  };
  const suggestions = buildDailySuggestions(snapshot, new Set(), new Map());
  expect(suggestions.filter((s) => s.kind === "transfer")).toHaveLength(0);
  expect(
    suggestions.filter((s) => s.kind === "purchase").map((s) => s.quantity),
  ).toEqual(["5.000000", "5.000000"]);
});
