import { expect, it } from "vitest";
import { groupCostRange } from "../src/modules/catalog/product-cost-model";
import { integer, six } from "../src/modules/inventory/decimal";

it("conserva el rango exacto frente a enumeración exhaustiva, con redondeos y faltantes", () => {
  for (const unknown of [false, true]) {
    const options = [
      { costs: ["0", "1.333333", "2.666667", "4.000000"] },
      { costs: ["0", unknown ? null : "0.000001", "0.000003"] },
      { costs: ["0", "0"] },
    ];
    for (let min = 0; min <= 6; min++)
      for (let max = min; max <= 6; max++) {
        const totals: (bigint | null)[] = [];
        for (let a = 0; a < 4; a++)
          for (let b = 0; b < 3; b++)
            for (let c = 0; c < 2; c++) {
              if (a + b + c < min || a + b + c > max) continue;
              const values = [
                options[0].costs[a],
                options[1].costs[b],
                options[2].costs[c],
              ];
              totals.push(
                values.some((v) => v === null)
                  ? null
                  : values.reduce<bigint>((n, v) => n + integer(v!), 0n),
              );
            }
        const expected =
          !totals.length || totals.includes(null)
            ? { min: null, max: null }
            : {
                min: six(
                  (totals as bigint[]).reduce((a, b) => (a < b ? a : b)),
                ),
                max: six(
                  (totals as bigint[]).reduce((a, b) => (a > b ? a : b)),
                ),
              };
        expect(groupCostRange({ min, max, options })).toEqual(expected);
      }
  }
});
it("respeta mínimos, máximos y cantidades por opción", () => {
  expect(
    groupCostRange({
      min: 2,
      max: 3,
      options: [
        { costs: ["0", "2.000000", "4.000000"] },
        { costs: ["0", "5.000000"] },
      ],
    }),
  ).toEqual({ min: "4.000000", max: "9.000000" });
});
it("no interpreta un costo pendiente como cero", () => {
  expect(
    groupCostRange({
      min: 1,
      max: 1,
      options: [{ costs: ["0", null] }, { costs: ["0", "0.000000"] }],
    }),
  ).toEqual({ min: null, max: null });
  expect(
    groupCostRange({ min: 0, max: 0, options: [{ costs: ["0", null] }] }),
  ).toEqual({ min: "0.000000", max: "0.000000" });
});
