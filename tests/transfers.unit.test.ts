import { expect, it } from "vitest";
import { transferPortion } from "../src/modules/transfers/value";
it("settles the exact dispatch value over partial receipts", () => {
  expect(transferPortion(3n, 10n, 0n, 0n, 1n)).toBe(3n);
  expect(transferPortion(3n, 10n, 1n, 3n, 2n)).toBe(7n);
  expect(transferPortion(3n, null, 1n, 0n, 2n)).toBeNull();
  expect(transferPortion(3n, 0n, 1n, 0n, 2n)).toBe(0n);
  expect(() => transferPortion(3n, 10n, 1n, 3n, 3n)).toThrow();
});
