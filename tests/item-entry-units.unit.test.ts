import { describe, expect, it } from "vitest";
import {
  toBaseCost,
  displayCost,
  changeCostUnit,
} from "../src/modules/catalog/entry-units";

describe("unidades de carga de ingredientes", () => {
  it("convierte el precio de un litro a ml y de un kilo a g", () => {
    expect(toBaseCost("l", "1.500")).toEqual({
      baseUnit: "ml",
      unitCost: "1,500000",
    });
    expect(toBaseCost("kg", "2.500,50")).toEqual({
      baseUnit: "g",
      unitCost: "2,500500",
    });
  });
  it("muestra costos existentes sin perder precisión al guardar", () => {
    const cost = displayCost("l", "0.123456");
    expect(cost).toBe("123,456");
    expect(toBaseCost("l", cost).unitCost).toBe("0,123456");
  });
  it("convierte al cambiar dentro de la misma magnitud", () => {
    expect(changeCostUnit("l", "ml", "1500")).toBe("1,5");
    expect(changeCostUnit("g", "kg", "2,5")).toBe("2500");
    expect(changeCostUnit("l", "kg", "1500")).toBe("");
  });
  it("conserva costos pendientes y cero", () => {
    expect(toBaseCost("l", "").unitCost).toBe("");
    expect(toBaseCost("unit", "0").unitCost).toBe("0,000000");
  });
  it("rechaza valores inválidos o conversiones que perderían precisión", () => {
    expect(() => toBaseCost("l", "1,000001")).toThrow();
    expect(() => toBaseCost("ml", "-5")).toThrow();
  });
});
