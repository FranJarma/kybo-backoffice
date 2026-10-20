import { it, expect } from "vitest";
import { salesVisibility } from "../src/modules/sales/visibility";
it("keeps fee estimates visible only to managers without mutating the underlying sale", () => {
  const value = {
    id: "sale",
    payments: [
      {
        amount: "100.00",
        methodName: "Card",
        commissionPercent: "3.00",
        commissionAmount: "3.00",
        settlementNet: "97.00",
      },
    ],
  };
  expect(salesVisibility({ id: "staff", role: "staff" }, value)).toEqual({
    id: "sale",
    payments: [{ amount: "100.00", methodName: "Card" }],
  });
  expect(value.payments[0].commissionAmount).toBe("3.00");
  expect(salesVisibility({ id: "admin", role: "admin" }, value)).toBe(value);
});
