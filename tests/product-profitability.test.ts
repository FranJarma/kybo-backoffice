import { expect, it } from "vitest";
import {
  estimateProfitability,
  referenceBasis,
  type ProfitabilityData,
} from "../src/modules/pricing/product-profitability";
import type { Configuration } from "../src/modules/modifiers/types";

const basis = {
  cost: "4000.000000",
  extras: { counter: "0.00", pedidosya: "0.00", ubereats: "0.00" },
  labels: [],
};
const data: ProfitabilityData = {
  productId: "tea",
  vatRate: "21.00",
  channels: [{ id: "counter", enabled: true, finalBase: "12100.00" }],
  basis,
  groups: [],
  methods: [
    { id: "cash", name: "Efectivo", percent: "0.00" },
    { id: "card", name: "Tarjeta", percent: "3.00" },
    { id: "unknown", name: "Sin definir", percent: null },
  ],
};

it("allocates monthly overhead without losing the contribution margin", () => {
  const result = estimateProfitability(
    {
      ...data,
      overhead: {
        month: "2026-10",
        budgetTotal: "2000000.00",
        expectedUnits: 4000,
        iibbRate: "0.00",
      },
      finalUnits: 1,
    },
    "counter",
    {},
  );
  expect(result.overheadAmount).toBe("500.000000");
  expect(result.methods[0]).toMatchObject({
    margin: "6000.00",
    marginAfterOverhead: "5500.00",
  });
  expect(result.methods[1]).toMatchObject({
    margin: "5637.00",
    marginAfterOverhead: "5137.00",
  });
  const combo = estimateProfitability(
    {
      ...data,
      overhead: {
        month: "2026-10",
        budgetTotal: "1.00",
        expectedUnits: 3,
        iibbRate: "0.00",
      },
      finalUnits: 3,
    },
    "counter",
    {},
  );
  expect(combo.overheadAmount).toBe("1.000000");
  expect(
    estimateProfitability(data, "counter", {}).methods[0].marginAfterOverhead,
  ).toBeNull();
  expect(
    estimateProfitability(
      {
        ...data,
        overhead: {
          month: "2026-10",
          budgetTotal: "30000000.00",
          expectedUnits: 4000,
          iibbRate: "0.00",
        },
      },
      "counter",
      {},
    ).methods[0].marginAfterOverhead,
  ).toBe("-1500.00");
});

it("deducts the fee on gross payment from net revenue, separately from recipe cost", () => {
  const result = estimateProfitability(data, "counter", {});
  expect(result).toMatchObject({
    netPrice: "10000.00",
    finalPrice: "12100.00",
    cost: "4000.000000",
  });
  expect(result.methods).toMatchObject([
    { id: "cash", commission: "0.00", margin: "6000.00" },
    { id: "card", commission: "363.00", margin: "5637.00" },
    { id: "unknown", commission: null, margin: null },
  ]);
});
it("keeps missing VAT and cost pending, distinct from explicit zero", () => {
  const pendingVat = estimateProfitability(
    { ...data, vatRate: null },
    "counter",
    {},
  );
  expect(pendingVat.netPrice).toBeNull();
  expect(pendingVat.finalPrice).toBeNull();
  expect(pendingVat.methods.every((m) => m.margin === null)).toBe(true);
  const pendingCost = estimateProfitability(
    { ...data, basis: { ...basis, cost: null } },
    "counter",
    {},
  );
  expect(pendingCost.methods[1]).toMatchObject({
    commission: "363.00",
    margin: null,
  });
  const zero = estimateProfitability(
    { ...data, vatRate: "0.00", basis: { ...basis, cost: "0.000000" } },
    "counter",
    {},
  );
  expect(zero.methods[1]).toMatchObject({
    commission: "363.00",
    margin: "11737.00",
  });
});
it("retains six-decimal costs until the final rounding and allows losses", () => {
  const loss = estimateProfitability(
    { ...data, basis: { ...basis, cost: "10000.005000" } },
    "counter",
    {},
  );
  expect(loss.methods[0].margin).toBe("-0.01");
  expect(loss.methods[1].margin).toBe("-363.01");
});
it("combines included costs and final extras, extracting combo VAT once", () => {
  const combo: ProfitabilityData = {
    ...data,
    channels: [{ id: "counter", enabled: true, finalBase: "5000.00" }],
    basis: { ...basis, cost: "0.000000" },
    groups: [
      {
        id: "food",
        name: "Waffle",
        quantity: 2,
        options: [
          {
            id: "classic",
            name: "Classic",
            basis: {
              ...basis,
              cost: "1000.000000",
              extras: { counter: "250.00" },
            },
          },
        ],
      },
      {
        id: "drink",
        name: "Gaseosa",
        quantity: 1,
        options: [
          {
            id: "pepsi",
            name: "Pepsi",
            basis: {
              ...basis,
              cost: "1200.000000",
              extras: { counter: "100.00" },
            },
          },
        ],
      },
    ],
  };
  const result = estimateProfitability(combo, "counter", {
    food: "classic",
    drink: "pepsi",
  });
  expect(result).toMatchObject({
    netPrice: "4628.10",
    finalPrice: "5600.00",
    cost: "3200.000000",
  });
  expect(result.methods[1]).toMatchObject({
    commission: "168.00",
    margin: "1260.10",
  });
  expect(
    estimateProfitability(combo, "counter", { food: "missing" }).netPrice,
  ).toBeNull();
});
it("does not calculate a margin for an unavailable sales channel", () => {
  const disabled = estimateProfitability(
    {
      ...data,
      channels: [{ id: "counter", enabled: false, finalBase: "10000.00" }],
    },
    "counter",
    {},
  );
  expect(disabled.netPrice).toBeNull();
  expect(disabled.methods.every((m) => m.margin === null)).toBe(true);
});
it("includes published default modifier surcharges and never assumes an unknown surcharge is zero", () => {
  const config: Configuration = {
    recipeVersionId: "recipe",
    revision: 1,
    model: "configurable",
    yieldQuantity: "1.000000",
    fixed: [],
    groups: [
      {
        id: "g",
        name: "Extras",
        groupVersionId: "v",
        min: 1,
        max: 2,
        factor: "1.000000",
        options: [
          {
            id: "o",
            key: "o",
            name: "Extra",
            kind: "instruction",
            instruction: "Extra",
            enabled: true,
            defaultCount: 2,
            maxCount: 2,
            mode: "inherit",
            components: [],
            prices: { counter: "100.00" },
          },
        ],
      },
    ],
  };
  const result = referenceBasis("4000.000000", config);
  expect(result.extras.counter).toBe("200.00");
  expect(result.extras.pedidosya).toBeNull();
  const withExtra = estimateProfitability(
    { ...data, basis: result },
    "counter",
    {},
  );
  expect(withExtra).toMatchObject({
    netPrice: "10165.29",
    finalPrice: "12300.00",
  });
  expect(withExtra.methods[1]).toMatchObject({
    commission: "369.00",
    margin: "5796.29",
  });
});
