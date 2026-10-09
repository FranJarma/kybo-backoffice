import { expect, it } from "vitest";
import {
  branchProductInput,
  nextBranchProduct,
} from "../src/modules/products/branch-settings";
import { pageOffset } from "../src/modules/products/pagination";
it("acepta clientes anteriores preservando el agotado y rechaza revisiones viejas", () => {
  const old = branchProductInput.parse({
    enabled: true,
    dispatchLocationId: null,
  });
  const current = { revision: 4, temporarilySoldOut: true };
  expect(nextBranchProduct(old, current)).toMatchObject({
    revision: 5,
    temporarilySoldOut: true,
  });
  expect(() => nextBranchProduct({ ...old, revision: 3 }, current)).toThrow();
});
it("recupera la última página disponible tras reducirse el resultado", () => {
  expect(pageOffset(30, 12)).toBe(0);
  expect(pageOffset(60, 40)).toBe(30);
  expect(pageOffset(0, 0)).toBe(0);
  expect(pageOffset(30, 60)).toBe(30);
});
