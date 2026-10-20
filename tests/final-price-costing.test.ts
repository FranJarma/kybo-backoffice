import { expect, it } from "vitest";
import { catalogFinalPrice, vatBreakdown } from "@/modules/pricing/amounts";
import {
  estimateProfitability,
  type ProfitabilityData,
} from "@/modules/pricing/product-profitability";
const data: ProfitabilityData = {
  productId: "tea",
  vatRate: "21.00",
  channels: [{ id: "counter", enabled: true, finalBase: "6000.00" }],
  basis: { cost: "1200.000000", extras: { counter: "0.00" }, labels: [] },
  groups: [],
  methods: [{ id: "card", name: "Tarjeta", percent: "3.00" }],
  overhead: {
    month: "2026-10",
    budgetTotal: "2000000.00",
    expectedUnits: 4000,
    iibbRate: "4.50",
  },
  finalUnits: 1,
};
it("keeps the catalog amount final and extracts rather than adds VAT", () => {
  expect(catalogFinalPrice("6000.00", "21.00")).toBe("6000.00");
  expect(catalogFinalPrice("6000.00", null)).toBeNull();
  expect(vatBreakdown("6000.00", "21.00")).toEqual({
    netTotal: "4958.68",
    vatTotal: "1041.32",
  });
  expect(estimateProfitability(data, "counter", {})).toMatchObject({
    finalPrice: "6000.00",
    netPrice: "4958.68",
    vatAmount: "1041.32",
    iibbAmount: "223.14",
    overheadAmount: "500.000000",
    methods: [
      {
        commission: "180.00",
        margin: "3578.68",
        marginAfterTaxes: "3355.54",
        marginAfterOverhead: "2855.54",
      },
    ],
  });
});
it("keeps an unconfirmed IIBB estimate pending, distinct from explicit zero", () => {
  const pending = estimateProfitability(
    { ...data, overhead: { ...data.overhead!, iibbRate: null } },
    "counter",
    {},
  );
  expect(pending.methods[0]).toMatchObject({
    margin: "3578.68",
    marginAfterTaxes: null,
    marginAfterOverhead: null,
  });
  expect(
    estimateProfitability(
      { ...data, overhead: { ...data.overhead!, iibbRate: "0.00" } },
      "counter",
      {},
    ).methods[0].marginAfterOverhead,
  ).toBe("3078.68");
});
it("adds final modifier amounts before extracting tax and handles 10.5 percent", () => {
  const result = estimateProfitability(
    {
      ...data,
      vatRate: "10.50",
      basis: { ...data.basis, extras: { counter: "100.00" } },
    },
    "counter",
    {},
  );
  expect(result.finalPrice).toBe("6100.00");
  expect(result.netPrice).toBe("5520.36");
  expect(result.vatAmount).toBe("579.64");
});
