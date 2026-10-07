import { describe, expect, it } from "vitest";
import { nextValuation } from "../src/modules/inventory/valuation";
import {
  allocateFefo,
  availableQuantity,
  type AvailableLot,
} from "../src/modules/inventory/availability";
describe("physical availability", () => {
  const lot: AvailableLot = {
    id: "a",
    receivedOn: "2026-09-01",
    expiresOn: null,
    blocked: false,
    locationBlocked: false,
    quantity: 100n,
    reserved: 30n,
  };
  it("excludes existing reservations, blocks and same-day expiry", () => {
    expect(availableQuantity(lot, "2026-09-28")).toBe(70n);
    for (const change of [
      { blocked: true },
      { locationBlocked: true },
      { expiresOn: "2026-09-28" },
      { reserved: 110n },
    ])
      expect(availableQuantity({ ...lot, ...change }, "2026-09-28")).toBe(0n);
  });
  it("allocates earliest expiry first with stable tie breaks and no input mutation", () => {
    expect(
      allocateFefo(
        [lot, { ...lot, id: "b", expiresOn: "2026-10-01" }],
        90n,
        "2026-09-28",
      ),
    ).toEqual([
      { lotId: "b", quantity: 70n },
      { lotId: "a", quantity: 20n },
    ]);
    expect(lot.reserved).toBe(30n);
    expect(() => allocateFefo([lot], 71n, "2026-09-28")).toThrow();
  });
});
describe("branch average valuation", () => {
  it("distinguishes unknown from zero and clears an empty balance", () => {
    expect(nextValuation(10n, null, -10n, null)).toEqual({
      quantity: 0n,
      value: 0n,
      appliedValue: null,
    });
    expect(nextValuation(10n, 0n, 5n, 5n).value).toBe(5n);
    expect(nextValuation(10n, null, 5n, 5n).value).toBeNull();
  });
  it("retains the rounding remainder for the final withdrawal", () => {
    const first = nextValuation(3n, 10n, -1n, null);
    const last = nextValuation(first.quantity, first.value, -2n, null);
    expect(first.appliedValue! + last.appliedValue!).toBe(-10n);
    expect(last.value).toBe(0n);
    expect(() => nextValuation(1n, 5n, -2n, null)).toThrow();
  });
});
