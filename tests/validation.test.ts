import { describe, it, expect } from "vitest";
import { parseDecimal, parseInput } from "../src/modules/catalog/validation";

describe("decimal amounts entered in Argentina", () => {
  it.each([
    ["", "6", null],
    ["0", "6", "0.000000"],
    ["54,208", "6", "54.208000"],
    ["54.208,00", "2", "54208.00"],
    ["7.500", "2", "7500.00"],
    ["0,123456", "6", "0.123456"],
  ])("parses %s without converting absence to zero", (value, scale, want) => {
    expect(parseDecimal(value, Number(scale))).toBe(want);
  });
  it.each(["-1", "1e3", "Infinity", "7.50", "1,2,3", "54.20,00", "0,1234567"])(
    "rejects invalid or excessive-precision %s",
    (value) => {
      expect(() => parseDecimal(value, 6)).toThrow();
    },
  );
});

describe("strict catalog inputs", () => {
  it("stores an unknown ingredient cost as null", () => {
    expect(
      parseInput("ingredients", {
        name: "Leche",
        baseUnit: "ml",
        unitCost: "",
      }),
    ).toEqual({ name: "Leche", baseUnit: "ml", unitCost: null });
  });
  it("normalizes optional contact without granting marketing consent", () => {
    expect(
      parseInput("customers", {
        name: " Ana ",
        email: "",
        phone: "+54 9 387 123 4567",
      }),
    ).toEqual({ name: "Ana", email: null, phone: "+5493871234567" });
    expect(() =>
      parseInput("customers", {
        name: "Ana",
        email: "",
        phone: "",
        marketingOptIn: true,
      }),
    ).toThrow();
  });
  it("rejects invalid base unit and zero-size pack", () => {
    expect(() =>
      parseInput("ingredients", {
        name: "Leche",
        baseUnit: "kg",
        unitCost: "",
      }),
    ).toThrow();
    expect(() =>
      parseInput("presentations", {
        name: "Bolsa",
        supplierId: crypto.randomUUID(),
        ingredientId: crypto.randomUUID(),
        baseQuantity: "0",
      }),
    ).toThrow();
  });
  it("does not accept record identifiers in editable data", () => {
    expect(() =>
      parseInput("suppliers", {
        id: crypto.randomUUID(),
        name: "Proveedor",
        email: "",
        phone: "",
        notes: "",
      }),
    ).toThrow();
  });
});
