import { expect, it } from "vitest";
import {
  transferEntryUnit,
  parseTransferQuantity,
  formatTransferQuantity,
} from "@/modules/transfers/quantities";
it.each([
  ["ml", "litros", "l", "10", "10000.000000"],
  ["g", "kilos", "kg", "2,5", "2500.000000"],
  ["unit", "unidades", "unid.", "12", "12.000000"],
] as const)(
  "%s quantities enter in %s and preserve the inventory base",
  (baseUnit, label, symbol, input, expected) => {
    expect(transferEntryUnit(baseUnit)).toMatchObject({ label, symbol });
    expect(parseTransferQuantity(input, baseUnit)).toBe(expected);
  },
);
it("uses Argentine decimals, preserves tiny amounts and checks limits after conversion", () => {
  expect(parseTransferQuantity("1.000,5", "ml")).toBe("1000500.000000");
  expect(parseTransferQuantity("0,000001", "g")).toBe("0.001000");
  expect(() => parseTransferQuantity("1000000000", "g")).toThrow();
  expect(() => parseTransferQuantity("0", "ml")).toThrow();
  expect(() => parseTransferQuantity("2.5", "g")).toThrow();
  expect(() => parseTransferQuantity("5", null)).toThrow();
});
it.each(["ml", "g"] as const)(
  "preserves every canonical decimal when entering %s in litres or kilos",
  (baseUnit) => {
    for (const canonical of [
      "0.000001",
      "1234.567891",
      "999999999999.999999",
    ]) {
      const formatted = formatTransferQuantity(canonical, baseUnit);
      expect(parseTransferQuantity(formatted.split(" ")[0], baseUnit)).toBe(
        canonical,
      );
    }
    expect(() => parseTransferQuantity("0,0000000001", baseUnit)).toThrow();
  },
);
it.each([
  ["10000.000000", "ml", "10 l"],
  ["2500.000000", "g", "2,5 kg"],
  ["0.000001", "ml", "0,000000001 l"],
  ["1000000.000000", "g", "1.000 kg"],
  ["12.000000", "unit", "12 unid."],
] as const)(
  "formats %s %s for the person moving it",
  (value, unit, expected) => {
    expect(formatTransferQuantity(value, unit)).toBe(expected);
  },
);
