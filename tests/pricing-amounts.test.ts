import { expect, it } from "vitest";
import {
  priceWithVat,
  vatBreakdown,
  paymentFee,
} from "../src/modules/pricing/amounts";

it.each([
  ["10000.00", "21.00", "12100.00"],
  ["10000.00", "10.50", "11050.00"],
  ["0.03", "21.00", "0.04"],
  ["10500.00", "0.00", "10500.00"],
])("prices %s net at %s%% as %s final", (net, rate, final) => {
  expect(priceWithVat(net, rate)).toBe(final);
});
it("never treats unknown VAT as zero", () => {
  expect(priceWithVat("10000.00", null)).toBeNull();
});
it.each(["21.01", "-1.00", "100.00", "10,5", "21"])(
  "rejects a noncanonical or unsupported VAT rate %s",
  (rate) => {
    expect(() => priceWithVat("100.00", rate)).toThrow();
  },
);
it("extracts VAT from an authorized final price, preserving every cent", () => {
  expect(vatBreakdown("12100.00", "21.00")).toEqual({
    netTotal: "10000.00",
    vatTotal: "2100.00",
  });
  expect(vatBreakdown("0.04", "21.00")).toEqual({
    netTotal: "0.03",
    vatTotal: "0.01",
  });
  expect(vatBreakdown("11050.00", "10.50")).toEqual({
    netTotal: "10000.00",
    vatTotal: "1050.00",
  });
});
it("computes fees on the collection without treating them as a customer surcharge", () => {
  expect(paymentFee("12100.00", "3.00")).toEqual({
    commissionAmount: "363.00",
    settlementNet: "11737.00",
  });
  expect(paymentFee("12100.00", "0.00")).toEqual({
    commissionAmount: "0.00",
    settlementNet: "12100.00",
  });
  expect(paymentFee("12100.00", null)).toEqual({
    commissionAmount: null,
    settlementNet: null,
  });
  expect(paymentFee("0.05", "10.00")).toEqual({
    commissionAmount: "0.01",
    settlementNet: "0.04",
  });
});
it("rejects overflow and invalid commissions", () => {
  expect(() => priceWithVat("999999999999.99", "21.00")).toThrow();
  expect(() => paymentFee("100.00", "100.01")).toThrow();
  expect(() => paymentFee("100.00", "-0.01")).toThrow();
});
