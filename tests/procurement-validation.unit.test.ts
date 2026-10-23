import { expect, it } from "vitest";
import { parseReceive } from "@/modules/inventory/validation";
const id = "11111111-1111-4111-8111-111111111111";
it("accepts an explicit purchase order and line reference on an existing receipt", () => {
  expect(() =>
    parseReceive({
      requestId: id,
      supplierId: id,
      locationId: id,
      receivedOn: "2026-10-23",
      purchaseOrderId: id,
      expectedOrderRevision: 2,
      lines: [{ itemId: id, orderLineId: id, quantity: "40" }],
    }),
  ).not.toThrow();
});
