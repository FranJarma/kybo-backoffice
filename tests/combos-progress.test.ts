import { expect, it } from "vitest";
import { comboProgress } from "../src/modules/combos/progress";
it("waits for every component and scales quantities", () => {
  expect(
    comboProgress(2, [
      {
        quantity: 2,
        progress: { mode: "recipe", completed: 2, delivered: 1, cancelled: 0 },
      },
      {
        quantity: 4,
        progress: { mode: "direct", completed: 0, delivered: 1, cancelled: 0 },
      },
    ]),
  ).toEqual({ ordered: 2, completed: 0, delivered: 0, cancelled: 0 });
  expect(
    comboProgress(2, [
      {
        quantity: 2,
        progress: { mode: "recipe", completed: 2, delivered: 2, cancelled: 0 },
      },
      {
        quantity: 4,
        progress: { mode: "direct", completed: 0, delivered: 4, cancelled: 0 },
      },
    ]),
  ).toEqual({ ordered: 2, completed: 2, delivered: 2, cancelled: 0 });
});
