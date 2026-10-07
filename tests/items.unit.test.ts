import { describe, expect, it } from "vitest";
import { convertToBase } from "../src/modules/items/units";
import { itemSchema } from "../src/modules/items/validation";

describe("article units", () => {
  it("converts kilograms and litres without changing dimensions", () => {
    expect(convertToBase("1.250000", "kg", "g")).toBe("1250.000000");
    expect(convertToBase("0.500000", "l", "ml")).toBe("500.000000");
    expect(() => convertToBase("1.000000", "ml", "g")).toThrow();
  });
  it("rejects imprecise, negative and overflowing quantities", () => {
    for (const value of [
      "0.0000001",
      "-1",
      "NaN",
      "1,2",
      "999999999999.999999",
    ])
      expect(() => convertToBase(value, "kg", "g")).toThrow();
  });
});
describe("article classification", () => {
  const input = {
    code: "VASO-500",
    name: "Vaso 500 ml",
    class: "packaging",
    baseUnit: "unit",
    purchasable: true,
    recipeUsable: true,
    unitCost: null,
  };
  it("allows packaging in compositions", () => {
    expect(itemSchema.parse(input).class).toBe("packaging");
  });
  it("never includes cleaning products in a food recipe", () => {
    expect(itemSchema.safeParse({ ...input, class: "cleaning" }).success).toBe(
      false,
    );
    expect(
      itemSchema.parse({ ...input, class: "cleaning", recipeUsable: false })
        .class,
    ).toBe("cleaning");
  });
  it("requires deliberate classification for new records", () => {
    expect(
      itemSchema.safeParse({ ...input, class: "unclassified" }).success,
    ).toBe(false);
    expect(itemSchema.safeParse({ ...input, code: " " }).success).toBe(false);
  });
});
