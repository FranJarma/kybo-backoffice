import { expect, it } from "vitest";
import { planConsumption } from "../src/modules/production/consumption";
const reserved = [
  {
    itemId: "flour",
    lotId: "lot-a",
    locationId: "kitchen",
    quantity: "3.000000",
  },
  {
    itemId: "flour",
    lotId: "lot-b",
    locationId: "kitchen",
    quantity: "2.000000",
  },
  {
    itemId: "water",
    lotId: "lot-c",
    locationId: "kitchen",
    quantity: "1.000000",
  },
];
it("releases unused material and requires separate availability for excess", () => {
  const result = planConsumption(reserved, [
    { itemId: "flour", quantity: "4.000000" },
    { itemId: "water", quantity: "1.500000" },
  ]);
  expect(result.consume.map((a) => [a.lotId, a.quantity])).toEqual([
    ["lot-a", "3.000000"],
    ["lot-b", "1.000000"],
    ["lot-c", "1.000000"],
  ]);
  expect(result.release.map((a) => [a.lotId, a.quantity])).toEqual([
    ["lot-b", "1.000000"],
  ]);
  expect(result.extra).toEqual([{ itemId: "water", quantity: "0.500000" }]);
});
it("requires the complete confirmed composition without duplicated substitutions", () => {
  expect(() =>
    planConsumption(reserved, [{ itemId: "flour", quantity: "1.000000" }]),
  ).toThrow();
  expect(() =>
    planConsumption(reserved, [
      { itemId: "flour", quantity: "1.000000" },
      { itemId: "flour", quantity: "1.000000" },
    ]),
  ).toThrow();
});
it("zero actual use releases all of that component", () => {
  const result = planConsumption(reserved, [
    { itemId: "flour", quantity: "0.000000" },
    { itemId: "water", quantity: "1.000000" },
  ]);
  expect(result.release).toEqual(reserved.slice(0, 2));
  expect(result.consume).toEqual(reserved.slice(2));
});
