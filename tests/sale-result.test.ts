import { expect, it } from "vitest";
import {
  saleConfirmationTitle,
  validSaleResult,
} from "@/components/sales/sale-result";
import type { SaleStatus } from "@/modules/sales/types";

it.each<[SaleStatus, string, string]>([
  ["closed", "525.00", "Venta cobrada"],
  ["closed", "0.00", "Venta sin cargo"],
  ["open", "525.00", "Venta pendiente de cobro"],
  ["cancelled", "525.00", "Venta anulada"],
])("describes a %s sale for %s", (status, totalAmount, title) => {
  expect(saleConfirmationTitle({ status, totalAmount })).toBe(title);
});

it("accepts a historical refund with signed totals only for the submitted sale", () => {
  const id = "ea1c1a17-d986-4c6c-bc00-43af9c41c422";
  const createdAt = "2026-11-21T19:23:10.000Z";
  const result = {
    id,
    number: 72,
    revision: 3,
    status: "cancelled",
    origin: "table",
    channel: "counter",
    fulfillment: "dine_in",
    createdAt,
    totalAmount: "50.00",
    paidAmount: "0.00",
    balanceDue: "0.00",
    localCollected: "-50.00",
    platformCollected: "0.00",
    orders: [{ id: "order", sequence: 1, createdAt, lines: [] }],
    payments: [
      {
        id: "payment",
        kind: "refund",
        collector: "local",
        methodName: "Efectivo",
        amount: "50.00",
        createdAt,
      },
    ],
  };
  const legacy = {
    ...result,
    payments: [
      {
        ...result.payments[0],
        commissionPercent: null,
        commissionAmount: null,
        settlementNet: null,
      },
    ],
  };
  expect(validSaleResult(legacy, { url: `/api/sales/${id}/cancel` })).toBe(
    true,
  );
  expect(validSaleResult(result, { url: `/api/sales/${id}/cancel` })).toBe(
    true,
  );
  expect(
    validSaleResult(result, {
      url: "/api/sales/9b2a4c5e-c7ef-4edb-8e1e-0b76d7df36e1/cancel",
    }),
  ).toBe(false);
});
