import { expect, it } from "vitest";
import { createSchema } from "../src/modules/sales/validation";
const sale = {
  requestId: crypto.randomUUID(),
  origin: "counter",
  channel: "counter",
  fulfillment: "takeaway",
  lines: [
    {
      productId: crypto.randomUUID(),
      quantity: 1,
      price: "10",
      expectedPrice: "10.00",
    },
  ],
};
it("accepts an occasional, registered or name-only customer", () => {
  expect(createSchema.safeParse(sale).success).toBe(true);
  expect(
    createSchema.safeParse({ ...sale, customerId: crypto.randomUUID() })
      .success,
  ).toBe(true);
  expect(
    createSchema.parse({ ...sale, customerName: "  Martina  " }).customerName,
  ).toBe("Martina");
});
it("rejects blank, overly long or ambiguous customer details", () => {
  for (const customerName of ["   ", "x".repeat(161)])
    expect(createSchema.safeParse({ ...sale, customerName }).success).toBe(
      false,
    );
  expect(
    createSchema.safeParse({
      ...sale,
      customerId: crypto.randomUUID(),
      customerName: "Other",
    }).success,
  ).toBe(false);
});
