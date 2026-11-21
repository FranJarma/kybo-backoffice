import { describe, expect, it } from "vitest";
import {
  cashChange,
  cashPaymentSummary,
  paymentAllocation,
} from "../src/components/sales/payment-math";

describe("POS checkout calculations", () => {
  const total = "18900.00";

  it.each([
    ["20.000", "1100.00"],
    ["18.900", "0.00"],
    ["50.000", "31100.00"],
  ])("calculates change from %s in cash", (received, change) => {
    expect(cashChange(received, "18.900")).toEqual({ valid: true, change });
  });

  it("allocates the example order total and its split payment", () => {
    expect(
      paymentAllocation(total, ["7.500", "7.900", "3.500"], true),
    ).toMatchObject({ assigned: 1890000n, remaining: 0n, valid: true });
    expect(paymentAllocation(total, ["10.000", "8.900"], true)).toMatchObject({
      assigned: 1890000n,
      remaining: 0n,
      valid: true,
    });
    expect(
      cashPaymentSummary([{ amount: "10.000", received: "20.000" }]),
    ).toEqual({
      applied: "10000.00",
      received: "20000.00",
      change: "10000.00",
    });
  });

  it("separates partial collections, missing amounts and excess", () => {
    expect(paymentAllocation(total, ["10000", "8000"], true)).toMatchObject({
      remaining: 90000n,
      valid: false,
    });
    expect(paymentAllocation(total, ["10000", "8000"], false)).toMatchObject({
      remaining: 90000n,
      valid: true,
    });
    expect(paymentAllocation(total, ["10000", ""], false)).toMatchObject({
      remaining: 890000n,
      valid: false,
    });
    expect(paymentAllocation(total, ["10000", "8900,01"], false)).toMatchObject(
      { remaining: -1n, valid: false },
    );
  });

  it("keeps cents precise when aggregating cash and rejects invalid tender", () => {
    expect(
      cashPaymentSummary([
        { amount: "900.000.000.000,01", received: "900.000.000.000,03" },
        { amount: "1,01", received: "1,02" },
      ]),
    ).toEqual({
      applied: "900000000001.02",
      received: "900000000001.05",
      change: "0.03",
    });
    expect(cashPaymentSummary([{ amount: "1", received: "" }])).toBeUndefined();
    expect(
      cashPaymentSummary([{ amount: "1", received: "0,99" }]),
    ).toBeUndefined();
    expect(cashPaymentSummary([])).toBeUndefined();
  });
});
