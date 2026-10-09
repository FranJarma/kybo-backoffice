import { describe, it, expect } from "vitest";
import { consumptionQuantity, parseWaste } from "../src/modules/recipes/waste";
import { resolveComposition } from "../src/modules/recipes/composition";
import type { Configuration } from "../src/modules/modifiers/types";
describe("merma sobre cantidad útil", () => {
  it("aplica merma a extras heredados y reemplazados una sola vez", () => {
    const config: Configuration = {
      recipeVersionId: "v",
      revision: 1,
      model: "configurable",
      yieldQuantity: "1.000000",
      fixed: [],
      groups: [
        {
          id: "g",
          groupVersionId: "gv",
          name: "Extras",
          min: 1,
          max: 2,
          factor: "2.000000",
          options: [
            {
              id: "o",
              key: "o",
              name: "Extra",
              kind: "composition",
              instruction: null,
              enabled: true,
              defaultCount: 1,
              maxCount: 2,
              mode: "inherit",
              prices: { counter: "0.00" },
              components: [
                {
                  itemId: "i",
                  name: "Ingrediente",
                  baseUnit: "g",
                  quantity: "40.000000",
                  wastePercent: "20.00",
                  archived: false,
                },
              ],
            },
          ],
        },
      ],
    };
    expect(
      resolveComposition(config, [{ recipeModifierOptionId: "o", count: 2 }])
        .components[0].quantity,
    ).toBe("200.000000");
    config.groups[0].options[0].mode = "override";
    const result = resolveComposition(config, [
      { recipeModifierOptionId: "o", count: 2 },
    ]);
    expect(result.components[0].quantity).toBe("100.000000");
    expect(result.components[0].wastePercent).toBe("0.00");
  });
  it("calcula consumo bruto sin subestimar y conserva cero merma", () => {
    expect(consumptionQuantity("100.000000", "10.00")).toBe("111.111112");
    expect(consumptionQuantity("100.000000")).toBe("100.000000");
    expect(consumptionQuantity("100.000000", "20.00", 3n, 2n)).toBe(
      "187.500000",
    );
  });
  it("rechaza pérdidas imposibles y acepta coma decimal", () => {
    expect(parseWaste("12,5")).toBe("12.50");
    for (const value of ["100", "101", "-1", "0,001"])
      expect(() => parseWaste(value)).toThrow();
  });
});
