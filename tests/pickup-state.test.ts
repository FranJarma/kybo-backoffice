import { expect, it } from "vitest";
import { pickupState } from "../src/modules/pickup/state";

const recipe = {
  mode: "recipe",
  ordered: 2,
  completed: 0,
  delivered: 0,
  cancelled: 0,
};
it("waits for every station and every combo component", () => {
  expect(
    pickupState(
      "closed",
      [recipe, { ...recipe, completed: 2 }],
      ["preparing", "ready"],
    ),
  ).toBe("preparing");
  expect(
    pickupState("open", [{ ...recipe, completed: 2 }], ["ready", "preparing"]),
  ).toBe("preparing");
  expect(
    pickupState(
      "closed",
      [
        { ...recipe, completed: 2 },
        { ...recipe, completed: 2 },
      ],
      ["ready", "ready"],
    ),
  ).toBe("ready");
});
it("keeps payment, physical return and delivery independent", () => {
  expect(pickupState("open", [{ ...recipe, mode: "direct" }], [])).toBe(
    "ready",
  );
  expect(
    pickupState("closed", [{ ...recipe, mode: "direct", delivered: 1 }], []),
  ).toBe("ready");
  expect(
    pickupState("closed", [{ ...recipe, mode: "direct", delivered: 2 }], []),
  ).toBe("delivered");
  expect(pickupState("cancelled", [recipe], ["preparing"])).toBe("cancelled");
});
it("does not announce incomplete or missing progress as ready", () => {
  expect(pickupState("closed", [], [])).toBe("preparing");
  expect(pickupState("closed", [null], [])).toBe("preparing");
  expect(pickupState("closed", [{ ...recipe, completed: 2 }], [])).toBe(
    "preparing",
  );
  expect(
    pickupState("open", [{ ...recipe, cancelled: 2 }], ["cancelled"]),
  ).toBe("cancelled");
});
