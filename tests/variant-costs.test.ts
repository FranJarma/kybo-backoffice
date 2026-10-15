import { expect, it } from "vitest";
import { variantTotals } from "@/modules/recipes/variant-costs";

it("compares full drinks with selected sweeteners without adding other pearl alternatives", () => {
  expect(
    variantTotals(
      ["1066.260000", "96.000000"],
      [[], ["606.060000"], ["211.460000"]],
    ),
  ).toEqual(["1162.260000", "1768.320000", "1373.720000"]);
});
it("keeps incomplete alternatives pending without hiding known alternatives", () => {
  expect(variantTotals(["10.000000"], [[], [null], ["2.000000"]])).toEqual([
    "10.000000",
    null,
    "12.000000",
  ]);
  expect(variantTotals([null], [[], ["2.000000"]])).toEqual([null, null]);
});
it("adds all components and preserves precision until display", () => {
  expect(variantTotals(["0.123456"], [["0.000001", "0.000002"]])).toEqual([
    "0.123459",
  ]);
});
