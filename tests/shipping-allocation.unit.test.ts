import { expect, it } from "vitest";
import { allocateShipping } from "../src/modules/inventory/shipping";

it("reparte por valor neto y conserva todos los centavos", () => {
  expect(allocateShipping(10000n, [30000n, 70000n])).toEqual([3000n, 7000n]);
  expect(allocateShipping(2n, [1n, 1n, 1n])).toEqual([1n, 1n, 0n]);
});
it("permite reparto manual, incluso mercadería sin cargo", () => {
  expect(allocateShipping(500n, [0n, 100n], [400n, 100n])).toEqual([
    400n,
    100n,
  ]);
  expect(() => allocateShipping(500n, [100n, 100n], [100n, 100n])).toThrow(
    "coincidir",
  );
});
it("rechaza precios pendientes, reparto sin base y valores negativos", () => {
  expect(() => allocateShipping(100n, [null])).toThrow();
  expect(() => allocateShipping(100n, [0n])).toThrow();
  expect(() => allocateShipping(100n, [100n], [-100n])).toThrow();
  expect(allocateShipping(0n, [null, 0n])).toEqual([0n, 0n]);
});
