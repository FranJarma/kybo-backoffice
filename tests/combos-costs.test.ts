import { expect, it } from "vitest";
import { comboCostRange } from "../src/modules/combos/costs";
import type { ComboDefinition } from "../src/modules/combos/service";
import type { ProductCost } from "../src/modules/catalog/product-cost-model";
const definition = {
  productId: "combo",
  groups: [{ quantity: 2, options: [{ productId: "a" }, { productId: "b" }] }],
} as ComboDefinition;
const model = (id: string, min: string | null, max: string | null) =>
  ({ productId: id, min, max, referenceItems: [] }) as unknown as ProductCost;
it("excludes options unavailable in this branch", () => {
  const costs = new Map([
    ["a", model("a", "10.000000", "20.000000")],
    ["b", model("b", null, null)],
  ]);
  expect(comboCostRange(definition, costs, new Set(["a"]))).toMatchObject({
    min: "20.000000",
    max: "40.000000",
  });
  expect(comboCostRange(definition, costs, new Set())).toMatchObject({
    status: "pending",
  });
});
it("sums allowed ranges times component quantity, never sale prices", () => {
  expect(
    comboCostRange(
      definition,
      new Map([
        ["a", model("a", "10.000000", "20.000000")],
        ["b", model("b", "15.000000", "30.000000")],
      ]),
    ),
  ).toMatchObject({ min: "20.000000", max: "60.000000" });
});
it("does not treat an unknown alternative as zero", () => {
  expect(
    comboCostRange(
      definition,
      new Map([
        ["a", model("a", "10.000000", "20.000000")],
        ["b", model("b", null, null)],
      ]),
    ),
  ).toMatchObject({ status: "pending", min: null, max: null });
});
