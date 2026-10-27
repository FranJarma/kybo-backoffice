import { expect, it } from "vitest";
import {
  addTransferDraftLine,
  transferDraftLines,
  suggestTransferDestination,
  type TransferDraftLine,
} from "@/modules/transfers/draft";
const milk: TransferDraftLine = {
  id: "milk",
  itemId: "milk",
  name: "Leche",
  baseUnit: "ml",
  amount: "10",
  destinationLocationId: "bar",
};
const destinations = [
  { id: "bar", branchId: "branch" },
  { id: "kitchen", branchId: "branch" },
  { id: "depot", branchId: "branch" },
  { id: "foreign", branchId: "other" },
];
it("merges repeated item/destination exactly and keeps other destinations separate", () => {
  const first = addTransferDraftLine([], milk);
  const result = addTransferDraftLine(first, {
    ...milk,
    id: "second",
    amount: "2,500000001",
  });
  expect(result).toEqual([{ ...milk, amount: "12,500000001" }]);
  expect(first).toEqual([milk]);
  const both = addTransferDraftLine(result, {
    ...milk,
    id: "third",
    destinationLocationId: "kitchen",
    amount: "1",
  });
  expect(transferDraftLines(both, "depot", destinations)).toEqual([
    { itemId: "milk", destinationLocationId: "bar", quantity: "12500.000001" },
    {
      itemId: "milk",
      destinationLocationId: "kitchen",
      quantity: "1000.000000",
    },
  ]);
});
it("rejects invalid edited quantities, missing/origin destinations and overflow", () => {
  expect(() => transferDraftLines([], "depot", destinations)).toThrow();
  expect(() =>
    transferDraftLines([{ ...milk, amount: " " }], "depot", destinations),
  ).toThrow(/Leche/);
  expect(() =>
    transferDraftLines(
      [{ ...milk, destinationLocationId: "depot" }],
      "depot",
      destinations,
    ),
  ).toThrow();
  expect(() =>
    transferDraftLines(
      [{ ...milk, destinationLocationId: "archived" }],
      "depot",
      destinations,
    ),
  ).toThrow();
  expect(() =>
    addTransferDraftLine([milk], { ...milk, amount: "1000000000" }),
  ).toThrow();
});
it("limits the list while allowing additions to an existing row at the limit", () => {
  const full = Array.from({ length: 100 }, (_, index) => ({
    ...milk,
    id: String(index),
    itemId: String(index),
    amount: "1",
  }));
  expect(() =>
    addTransferDraftLine(full, { ...milk, itemId: "new" }),
  ).toThrow();
  expect(
    addTransferDraftLine(full, { ...full[0], amount: "2" })[0].amount,
  ).toBe("3");
});
it("suggests only a unique active same-branch minimum destination excluding origin", () => {
  const suggest = (policies: { itemId: string; locationId: string }[]) =>
    suggestTransferDestination(
      "milk",
      "depot",
      policies,
      destinations,
      "branch",
    );
  expect(suggest([{ itemId: "milk", locationId: "bar" }])).toBe("bar");
  expect(suggest([])).toBe("");
  expect(
    suggest([
      { itemId: "milk", locationId: "bar" },
      { itemId: "milk", locationId: "kitchen" },
    ]),
  ).toBe("");
  expect(
    suggest([
      { itemId: "milk", locationId: "depot" },
      { itemId: "milk", locationId: "bar" },
    ]),
  ).toBe("bar");
  expect(
    suggest([
      { itemId: "milk", locationId: "archived" },
      { itemId: "milk", locationId: "foreign" },
    ]),
  ).toBe("");
});
