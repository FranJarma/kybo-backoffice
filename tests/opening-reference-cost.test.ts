import { expect, it } from "vitest";
import { openingReferenceCost } from "../src/modules/inventory/opening-quantity";

it("convierte la referencia por gramo o mililitro a kilo, litro y presentación", () => {
  expect(openingReferenceCost("30.000000", "1000.000000")).toBe("30000");
  expect(openingReferenceCost("1.350000", "1000.000000")).toBe("1350");
  expect(openingReferenceCost("1.350000", "12000.000000")).toBe("16200");
  expect(openingReferenceCost("30.000000", "1.000000")).toBe("30");
  expect(openingReferenceCost("0.001234", "1.000000")).toBe("0,001234");
});

it("distingue costo desconocido de cero y admite presentaciones fraccionarias", () => {
  expect(openingReferenceCost(null, "1000.000000")).toBe("");
  expect(openingReferenceCost("0.000000", "1000.000000")).toBe("0");
  expect(openingReferenceCost("3.500000", "2.500000")).toBe("8,75");
});
