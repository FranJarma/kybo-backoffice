import { expect, it } from "vitest";
import { locatorSelection } from "@/modules/pickup/selection";
import type { LocatorFleet } from "@/modules/pickup/types";
const held = (number: number) => ({
  id: String(number),
  number,
  orderId: "order",
  saleId: "sale",
  label: "1.1",
  cancelled: false,
});
const fleet: LocatorFleet = {
  count: 2,
  publicPath: "/pickup/test",
  occupied: [held(1)],
};
it("requires choosing a free locator and rejects a choice taken by another order", () => {
  expect(locatorSelection(fleet, null)).toMatchObject({
    required: true,
    valid: false,
  });
  expect(locatorSelection(fleet, 2)).toMatchObject({
    required: true,
    valid: true,
  });
  expect(locatorSelection(fleet, 1).valid).toBe(false);
  expect(locatorSelection(fleet, 3).valid).toBe(false);
});
it("allows no locator only when none are free and does not treat unknown availability as empty", () => {
  expect(
    locatorSelection({ ...fleet, occupied: [held(1), held(2)] }, null),
  ).toMatchObject({ required: false, valid: true });
  expect(locatorSelection(undefined, null).valid).toBe(false);
  expect(
    locatorSelection({ ...fleet, occupied: [held(1), held(1)] }, null).required,
  ).toBe(true);
});
