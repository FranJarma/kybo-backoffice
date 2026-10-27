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
  const suggestions = buildDailySuggestions(snapshot, new Map(), new Map());
  expect(suggestions.filter((s) => s.kind === "transfer")).toHaveLength(0);
  expect(
    suggestions.filter((s) => s.kind === "purchase").map((s) => s.quantity),
  ).toEqual(["5.000000", "5.000000"]);
});

const depot = { id: "depot", name: "Depósito principal" };
function preparedSnapshot(stock = "0.000000"): ReplenishmentSnapshot {
  const policies = ["bar", "kitchen"].map((id) => ({
    id,
    revision: 1,
    itemId: "caps",
    itemName: "Tapas",
    baseUnit: "unit",
    locationId: id,
    locationName: id,
    minimumQuantity: "2.000000",
    targetQuantity: "5.000000",
    preparationMinutes: null,
    enabled: true,
  }));
  return {
    asOf: "2026-10-23",
    locations: [depot],
    items: [],
    policies,
    alerts: policies.map((p) => ({
      ...p,
      kind: "production",
      severity: "empty",
      availableQuantity: "0.000000",
      suggestedQuantity: p.targetQuantity,
      activeProduction: [],
      sources: [
        {
          locationId: depot.id,
          locationName: depot.name,
          availableQuantity: stock,
        },
      ],
    })),
  };
}
it("aggregates destinations into full recipe batches in Depot, without transferring future stock", () => {
  const result = buildDailySuggestions(
    preparedSnapshot(),
    new Map([["caps", "4.000000"]]),
    new Map(),
    depot,
  );
  expect(result).toEqual([
    expect.objectContaining({
      kind: "production",
      locationId: "depot",
      quantity: "12.000000",
    }),
  ]);
  expect(result[0].reason).toContain("bar");
  expect(result[0].reason).toContain("kitchen");
});
it("allocates physical stock once and subtracts production already planned in Depot", () => {
  const result = buildDailySuggestions(
    preparedSnapshot("3.000000"),
    new Map([["caps", "4.000000"]]),
    new Map([["caps:depot", 4_000_000n]]),
    depot,
  );
  expect(
    result.filter((s) => s.kind === "transfer").map((s) => s.quantity),
  ).toEqual(["3.000000"]);
  expect(result.find((s) => s.kind === "production")?.quantity).toBe(
    "4.000000",
  );
  expect(
    buildDailySuggestions(
      preparedSnapshot(),
      new Map([["caps", "4.000000"]]),
      new Map([["caps:depot", 12_000_000n]]),
      depot,
    ),
  ).toEqual([]);
});
it("does not produce at a service location when Depot is missing", () => {
  const result = buildDailySuggestions(
    preparedSnapshot(),
    new Map([["caps", "4.000000"]]),
    new Map(),
  );
  expect(result).toHaveLength(1);
  expect(result[0]).toMatchObject({
    kind: "production",
    state: "blocked",
    locationId: null,
  });
  expect(result[0].reason).toContain("Depósito");
});
it("protects Depot's own target without counting its production commitment twice", () => {
  const snapshot = preparedSnapshot("3.000000");
  const policy = {
    ...snapshot.policies[0],
    id: "own",
    locationId: depot.id,
    locationName: depot.name,
    targetQuantity: "5.000000",
  };
  snapshot.policies.push(policy);
  snapshot.alerts.push({
    ...policy,
    kind: "production",
    severity: "low",
    availableQuantity: "3.000000",
    suggestedQuantity: "2.000000",
    sources: [],
    activeProduction: [],
  });
  const result = buildDailySuggestions(
    snapshot,
    new Map([["caps", "4.000000"]]),
    new Map([["caps:depot", 4_000_000n]]),
    depot,
  );
  expect(result).toEqual([
    expect.objectContaining({
      kind: "production",
      quantity: "8.000000",
      locationId: depot.id,
    }),
  ]);
});

it("deducts physical transfers already suggested into Depot from its retention gap", () => {
  const snapshot = preparedSnapshot();
  const base = snapshot.policies[0];
  const own = {
    ...base,
    id: "own",
    locationId: depot.id,
    locationName: depot.name,
  };
  const kitchen = {
    ...base,
    id: "kitchen",
    locationId: "kitchen",
    locationName: "Cocina",
  };
  snapshot.policies = [own, kitchen];
  snapshot.alerts = [own, kitchen].map((p) => ({
    ...p,
    kind: "production",
    severity: "empty",
    availableQuantity: p.id === "own" ? "0.000000" : "1.000000",
    suggestedQuantity: "5.000000",
    activeProduction: [],
    sources: [
      {
        locationId: "bar",
        locationName: "Barra",
        availableQuantity: "3.000000",
      },
    ],
  }));
  const result = buildDailySuggestions(
    snapshot,
    new Map([["caps", "1.000000"]]),
    new Map(),
    depot,
  );
  expect(result.filter((s) => s.kind === "transfer")).toEqual([
    expect.objectContaining({ locationId: depot.id, quantity: "3.000000" }),
  ]);
  expect(result.find((s) => s.kind === "production")?.quantity).toBe(
    "6.000000",
  );
});
