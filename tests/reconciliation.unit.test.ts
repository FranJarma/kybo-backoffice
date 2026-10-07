import { describe, expect, it } from "vitest";
import { replayValuation } from "../src/modules/transition/valuation-replay";
describe("reconciliación de valoración", () => {
  it("conserva costo desconocido hasta agotar y repone un valor conocido", () => {
    expect(
      replayValuation({ quantity: "2.000000", value: null }, [
        { quantity: "-2.000000", value: null },
        { quantity: "3.000000", value: "9.000000" },
      ]),
    ).toEqual({
      quantity: "3.000000",
      value: "9.000000",
      invalidMovements: [],
    });
  });
  it("detecta una salida cuyo valor no corresponde al promedio", () => {
    expect(
      replayValuation({ quantity: "2.000000", value: "8.000000" }, [
        { quantity: "-1.000000", value: "-3.000000" },
      ]).invalidMovements,
    ).toEqual([0]);
  });
  it("costo cero permanece conocido", () => {
    expect(
      replayValuation({ quantity: "0.000000", value: "0.000000" }, [
        { quantity: "2.000000", value: "0.000000" },
      ]).value,
    ).toBe("0.000000");
  });
});
