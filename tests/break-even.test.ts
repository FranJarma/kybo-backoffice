import { describe, expect, it } from "vitest";
import { calculateBreakEven } from "@/modules/overheads/break-even";
import type {
  BreakEvenScenario,
  BreakEvenSnapshot,
} from "@/modules/overheads/break-even-model";

type SnapshotProduct = BreakEvenSnapshot["products"][number];

function product(
  id: string,
  contribution: string | null,
  finalUnits = 1,
): SnapshotProduct {
  return {
    id,
    name: id === "combo" ? "Combo doble" : `Producto ${id}`,
    kind: finalUnits === 1 ? "individual" : "combo",
    finalUnits,
    labels: [],
    pendingReasons: [],
    estimates: [
      {
        channel: "counter",
        price: "10.00",
        netPrice: "8.26",
        cost: "3.123456",
        vat: "1.74",
        iibb: "0.25",
        methods: [{ id: "cash", commission: "0.00", contribution }],
      },
    ],
  };
}

function snapshot(
  products = [product("a", "4.00"), product("combo", "6.00", 2)],
): BreakEvenSnapshot {
  return {
    branchId: "branch-a",
    branchName: "Centro",
    month: "2026-10",
    asOf: "2026-10-20T12:00:00.000Z",
    expenseRevision: 1,
    budget: {
      total: "100.00",
      expectedUnits: 40,
      rate: "2.500000",
      pending: 0,
      entries: [
        {
          category: "rent",
          concept: "Alquiler",
          budget: "100.00",
          actual: null,
          notes: "",
        },
      ],
    },
    methods: [{ id: "cash", name: "Efectivo", percent: "0.00" }],
    historicalMix: [{ productId: "a", quantity: 100 }],
    historicalUnits: 100,
    historicalExcludedUnits: 0,
    warnings: [],
    products,
  };
}

function scenario(
  entries = [
    { productId: "a", quantity: 1 },
    { productId: "combo", quantity: 1 },
  ],
  changes: Partial<BreakEvenScenario> = {},
): BreakEvenScenario {
  return {
    channel: "counter",
    methodId: "cash",
    entries,
    expectedUnits: 60,
    daysOpen: 20,
    ...changes,
  };
}

describe("calculateBreakEven", () => {
  it("weights sale contributions by final units without duplicating combo revenue", () => {
    const result = calculateBreakEven(snapshot(), scenario());

    expect(result).toMatchObject({
      status: "ready",
      selectedUnits: 3,
      averageContribution: "3.33",
      breakEvenUnits: 30,
      breakEvenPerDay: 2,
      projectedContribution: "200.00",
      projectedProfit: "100.00",
      blockers: [],
    });
    expect(result.products).toEqual([
      {
        productId: "a",
        finalUnits: 1,
        price: "10.00",
        cost: "3.123456",
        commission: "0.00",
        iibb: "0.25",
        contribution: "4.00",
        allocatedOverhead: "1.67",
        projectedMargin: "2.33",
        breakEvenSales: 25,
        breakEvenUnits: 25,
        status: "ready",
        pendingReasons: [],
      },
      {
        productId: "combo",
        finalUnits: 2,
        price: "10.00",
        cost: "3.123456",
        commission: "0.00",
        iibb: "0.25",
        contribution: "6.00",
        allocatedOverhead: "3.33",
        projectedMargin: "2.67",
        breakEvenSales: 17,
        breakEvenUnits: 34,
        status: "ready",
        pendingReasons: [],
      },
    ]);
  });

  it("ceilings complete sale patterns before rounding average contributions", () => {
    const data = snapshot([product("a", "0.01"), product("b", "0.01")]);
    data.budget.total = "1.00";

    const result = calculateBreakEven(
      data,
      scenario([
        { productId: "a", quantity: 1 },
        { productId: "b", quantity: 2 },
      ]),
    );
    expect(result).toMatchObject({
      averageContribution: "0.01",
      breakEvenUnits: 102,
    });

    data.products[1].finalUnits = 2;
    expect(
      calculateBreakEven(
        data,
        scenario([
          { productId: "a", quantity: 1 },
          { productId: "b", quantity: 1 },
        ]),
      ),
    ).toMatchObject({
      averageContribution: "0.01",
      breakEvenUnits: 150,
    });
  });

  it.each([1, 2])(
    "requires whole combos for a single-product mix with relative quantity %s",
    (quantity) => {
      const data = snapshot([product("combo", "116.00", 2)]);
      data.budget.total = "100000.00";

      expect(
        calculateBreakEven(data, scenario([{ productId: "combo", quantity }])),
      ).toMatchObject({
        status: "ready",
        averageContribution: "58.00",
        breakEvenUnits: 1726,
        projectedContribution: "3480.00",
        projectedProfit: "-96520.00",
        products: [{ breakEvenSales: 863, breakEvenUnits: 1726 }],
      });
    },
  );

  it.each([1, 2])(
    "preserves a 2:1 mix by requiring complete reduced patterns at scale %s",
    (scale) => {
      const data = snapshot();
      data.budget.total = "90.00";
      data.budget.entries[0].budget = "90.00";

      expect(
        calculateBreakEven(
          data,
          scenario([
            { productId: "a", quantity: 2 * scale },
            { productId: "combo", quantity: scale },
          ]),
        ),
      ).toMatchObject({
        status: "ready",
        averageContribution: "3.50",
        breakEvenUnits: 28,
        projectedContribution: "210.00",
        projectedProfit: "120.00",
      });
    },
  );

  it("keeps the Costeo contribution even when the displayed cost has six decimals", () => {
    const data = snapshot([product("a", "1.23")]);
    const estimate = data.products[0].estimates[0];
    estimate.netPrice = "3.00";
    estimate.cost = "1.234567";
    estimate.methods[0].commission = "0.50";
    estimate.iibb = "0.03";

    expect(
      calculateBreakEven(data, scenario([{ productId: "a", quantity: 1 }])),
    ).toMatchObject({
      status: "ready",
      averageContribution: "1.23",
      breakEvenUnits: 82,
      projectedContribution: "73.80",
      products: [{ cost: "1.234567", contribution: "1.23" }],
    });
  });

  it("consolidates duplicate mix entries and ignores zero quantities", () => {
    const data = snapshot();
    data.products[1].pendingReasons = ["Falta receta."];
    data.products[1].estimates[0].cost = null;
    const result = calculateBreakEven(
      data,
      scenario([
        { productId: "a", quantity: 1 },
        { productId: "a", quantity: 2 },
        { productId: "combo", quantity: 0 },
      ]),
    );

    expect(result).toMatchObject({
      status: "ready",
      selectedUnits: 3,
      averageContribution: "4.00",
      breakEvenUnits: 25,
    });
    expect(result.products[1].status).toBe("pending");
  });

  it("requires an explicit mix even when a historical mix exists", () => {
    const result = calculateBreakEven(snapshot(), scenario([]));

    expect(result).toMatchObject({
      status: "missing_mix",
      selectedUnits: 0,
      averageContribution: null,
      breakEvenUnits: null,
      projectedContribution: null,
      projectedProfit: null,
    });
    expect(result.blockers.length).toBeGreaterThan(0);
    expect(result.products[0].breakEvenSales).toBe(25);
  });

  it("does not treat a pending budget as zero", () => {
    const data = snapshot();
    data.budget.total = null;
    data.budget.pending = 1;
    data.budget.entries[0].budget = null;
    const result = calculateBreakEven(data, scenario());

    expect(result).toMatchObject({
      status: "pending",
      breakEvenUnits: null,
      projectedProfit: null,
    });
    expect(result.blockers.join(" ")).toMatch(/presupuesto/i);
  });

  it("does not use a reported partial total when budget entries remain pending", () => {
    const data = snapshot();
    data.budget.pending = 1;
    data.budget.entries[0].budget = null;

    expect(calculateBreakEven(data, scenario())).toMatchObject({
      status: "pending",
      breakEvenUnits: null,
      projectedProfit: null,
    });
  });

  it.each(["price", "netPrice", "cost", "vat", "iibb"] as const)(
    "blocks selected products with pending %s",
    (field) => {
      const data = snapshot();
      data.products[0].estimates[0][field] = null;
      const result = calculateBreakEven(data, scenario());

      expect(result.status).toBe("pending");
      expect(result.breakEvenUnits).toBeNull();
      expect(result.products[0].status).toBe("pending");
      expect(result.blockers.join(" ")).toContain("Producto a");
    },
  );

  it("blocks missing payment commissions and product composition", () => {
    const data = snapshot();
    data.products[0].estimates[0].methods[0].commission = null;
    data.products[1].finalUnits = null;
    data.products[1].pendingReasons = ["Composición pendiente."];
    const result = calculateBreakEven(data, scenario());

    expect(result.status).toBe("pending");
    expect(result.breakEvenUnits).toBeNull();
    expect(result.products[0].commission).toBeNull();
    expect(result.products[1].pendingReasons).toContain(
      "Composición pendiente.",
    );
  });

  it.each(["0.00", "-1.00"])(
    "does not calculate growth-based equilibrium for contribution %s",
    (contribution) => {
      const result = calculateBreakEven(
        snapshot([product("a", contribution)]),
        scenario([{ productId: "a", quantity: 1 }]),
      );

      expect(result.status).toBe("non_positive");
      expect(result.breakEvenUnits).toBeNull();
      expect(result.breakEvenPerDay).toBeNull();
      expect(result.products[0].breakEvenSales).toBeNull();
      expect(result.products[0].status).toBe("non_positive");
      expect(result.projectedProfit).toBe(
        contribution === "0.00" ? "-100.00" : "-160.00",
      );
    },
  );

  it("allows a positive total mix with one negative product contribution", () => {
    const result = calculateBreakEven(
      snapshot([product("a", "4.00"), product("b", "-1.00")]),
      scenario([
        { productId: "a", quantity: 1 },
        { productId: "b", quantity: 1 },
      ]),
    );

    expect(result).toMatchObject({
      status: "ready",
      averageContribution: "1.50",
      breakEvenUnits: 68,
      projectedProfit: "-10.00",
    });
    expect(result.products[1].status).toBe("non_positive");
  });

  it("calculates zero equilibrium for an explicitly saved zero budget", () => {
    const data = snapshot();
    data.budget.total = "0.00";
    data.budget.entries[0].budget = "0.00";

    expect(calculateBreakEven(data, scenario())).toMatchObject({
      status: "ready",
      breakEvenUnits: 0,
      breakEvenPerDay: 0,
      projectedProfit: "200.00",
      products: [
        { breakEvenSales: 0, allocatedOverhead: "0.00" },
        { breakEvenSales: 0, allocatedOverhead: "0.00" },
      ],
    });
  });

  it("supports optional projection and opening days without inventing defaults", () => {
    expect(
      calculateBreakEven(
        snapshot(),
        scenario(undefined, { expectedUnits: null, daysOpen: null }),
      ),
    ).toMatchObject({
      status: "ready",
      breakEvenUnits: 30,
      breakEvenPerDay: null,
      projectedContribution: null,
      projectedProfit: null,
      products: [
        { allocatedOverhead: null, projectedMargin: null },
        { allocatedOverhead: null, projectedMargin: null },
      ],
    });
  });

  it("supports a zero projected volume without dividing by zero", () => {
    expect(
      calculateBreakEven(snapshot(), scenario(undefined, { expectedUnits: 0 })),
    ).toMatchObject({
      status: "ready",
      breakEvenUnits: 30,
      projectedContribution: "0.00",
      projectedProfit: "-100.00",
      products: [
        { allocatedOverhead: null, projectedMargin: null },
        { allocatedOverhead: null, projectedMargin: null },
      ],
    });
  });

  it.each([
    -1,
    0.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ])(
    "returns a readable blocker for invalid relative quantity %s",
    (quantity) => {
      const result = calculateBreakEven(
        snapshot(),
        scenario([{ productId: "a", quantity }]),
      );
      expect(result.status).toBe("pending");
      expect(result.breakEvenUnits).toBeNull();
      expect(result.blockers.join(" ")).toMatch(/cantidad/i);
    },
  );

  it.each([
    { channel: "unknown" },
    { methodId: "unknown" },
    { expectedUnits: -1 },
    { expectedUnits: 0.5 },
    { expectedUnits: Number.POSITIVE_INFINITY },
    { daysOpen: 0 },
    { daysOpen: 32 },
    { daysOpen: 1.5 },
  ])("blocks invalid scenario selections %j without throwing", (changes) => {
    const result = calculateBreakEven(
      snapshot(),
      scenario(undefined, changes as Partial<BreakEvenScenario>),
    );

    expect(result.status).toBe("pending");
    expect(result.breakEvenUnits).toBeNull();
    expect(result.blockers.length).toBeGreaterThan(0);
  });

  it("blocks unknown products without silently excluding their contribution", () => {
    const result = calculateBreakEven(
      snapshot(),
      scenario([{ productId: "removed", quantity: 1 }]),
    );

    expect(result.status).toBe("pending");
    expect(result.breakEvenUnits).toBeNull();
    expect(result.blockers.join(" ")).toMatch(/producto/i);
  });

  it.each(["1", "1.000", "NaN", "-1.00", "1000000000000.00"])(
    "blocks invalid budget amount %s",
    (amount) => {
      const data = snapshot();
      data.budget.total = amount;
      const result = calculateBreakEven(data, scenario());
      expect(result.status).toBe("pending");
      expect(result.breakEvenUnits).toBeNull();
      expect(result.blockers.join(" ")).toMatch(/presupuesto/i);
    },
  );

  it.each(["3.12", "-3.123456", "1000000000000.123456", "invalid"])(
    "blocks malformed six-decimal cost %s",
    (cost) => {
      const data = snapshot();
      data.products[0].estimates[0].cost = cost;
      const result = calculateBreakEven(data, scenario());
      expect(result.status).toBe("pending");
      expect(result.breakEvenUnits).toBeNull();
      expect(result.products[0].cost).toBeNull();
    },
  );

  it("blocks final-unit totals that cannot be represented safely", () => {
    const result = calculateBreakEven(
      snapshot(),
      scenario([{ productId: "combo", quantity: Number.MAX_SAFE_INTEGER }]),
    );

    expect(result.status).toBe("pending");
    expect(result.selectedUnits).toBe(0);
    expect(result.breakEvenUnits).toBeNull();
    expect(result.blockers.join(" ")).toMatch(/límite|rango/i);
  });

  it("blocks break-even thresholds above the safe integer range", () => {
    const data = snapshot([product("combo", "0.01", 1000)]);
    data.budget.total = "999999999999.99";

    const result = calculateBreakEven(
      data,
      scenario([{ productId: "combo", quantity: 1 }]),
    );
    expect(result.status).toBe("pending");
    expect(result.breakEvenUnits).toBeNull();
    expect(result.products[0].breakEvenUnits).toBeNull();
    expect(result.blockers.join(" ")).toMatch(/límite|rango/i);
  });

  it("blocks monetary projection overflow instead of returning unsafe amounts", () => {
    const result = calculateBreakEven(
      snapshot([product("a", "999999999999.99")]),
      scenario([{ productId: "a", quantity: 1 }], { expectedUnits: 2 }),
    );

    expect(result.status).toBe("pending");
    expect(result.projectedContribution).toBeNull();
    expect(result.projectedProfit).toBeNull();
    expect(result.blockers.join(" ")).toMatch(/límite|rango/i);
  });
});
