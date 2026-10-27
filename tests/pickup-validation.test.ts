import { expect, it } from "vitest";
import { orderSchema } from "../src/modules/sales/validation";

it("accepts an optional locator independently for each added order", () => {
  const raw = {
    requestId: crypto.randomUUID(),
    revision: 1,
    lines: [
      {
        productId: crypto.randomUUID(),
        quantity: 1,
        price: "10",
        expectedPrice: "10.00",
      },
    ],
    locatorNumber: 16,
  };
  expect(orderSchema.safeParse(raw).success).toBe(true);
  expect(orderSchema.safeParse({ ...raw, locatorNumber: null }).success).toBe(
    true,
  );
  for (const locatorNumber of [0, -1, 1.5, "1", 1000])
    expect(orderSchema.safeParse({ ...raw, locatorNumber }).success).toBe(
      false,
    );
});
