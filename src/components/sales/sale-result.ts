import type { SaleDetail } from "@/modules/sales/types";
import { integer } from "@/modules/inventory/decimal";

const object = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const text = (value: unknown) => typeof value === "string";
const optionalText = (value: unknown) => value == null || text(value);
const amount = (value: unknown) =>
  typeof value === "string" && /^-?\d+\.\d{2}$/.test(value);
const date = (value: unknown) =>
  typeof value === "string" && Number.isFinite(Date.parse(value));

function validLine(line: unknown) {
  return (
    object(line) &&
    text(line.id) &&
    text(line.name) &&
    Number.isInteger(line.quantity) &&
    amount(line.unitPrice) &&
    amount(line.lineTotal) &&
    (line.listPrice == null || amount(line.listPrice)) &&
    optionalText(line.notes) &&
    optionalText(line.priceReason) &&
    (line.vatRate == null ||
      (text(line.vatRate) && amount(line.netTotal) && amount(line.vatTotal))) &&
    (line.modifiers == null ||
      (Array.isArray(line.modifiers) &&
        line.modifiers.every(
          (m) => object(m) && Number.isInteger(m.count) && text(m.optionName),
        )))
  );
}

function validOrder(order: unknown) {
  return (
    object(order) &&
    text(order.id) &&
    Number.isInteger(order.sequence) &&
    (order.locatorNumber == null || Number.isInteger(order.locatorNumber)) &&
    date(order.createdAt) &&
    optionalText(order.notes) &&
    Array.isArray(order.lines) &&
    order.lines.every(validLine)
  );
}

function validPayment(payment: unknown) {
  return (
    object(payment) &&
    text(payment.id) &&
    (payment.kind === "collection" || payment.kind === "refund") &&
    (payment.collector === "local" || payment.collector === "platform") &&
    amount(payment.amount) &&
    date(payment.createdAt) &&
    optionalText(payment.methodName) &&
    optionalText(payment.reference) &&
    (payment.commissionAmount == null ||
      (amount(payment.commissionAmount) && amount(payment.settlementNet)))
  );
}

// Check the fields consumed by confirmation and sale detail before dropping the replay.
export function validSaleResult(result: unknown, operation: { url: string }) {
  return (
    object(result) &&
    typeof result.id === "string" &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(result.id) &&
    (operation.url === "/api/sales" ||
      result.id === operation.url.split("/")[3]) &&
    Number.isInteger(result.number) &&
    Number.isInteger(result.revision) &&
    (result.origin === "counter" ||
      result.origin === "table" ||
      result.origin === "delivery") &&
    (result.channel === "counter" ||
      result.channel === "pedidosya" ||
      result.channel === "ubereats") &&
    (result.status === "open" ||
      result.status === "closed" ||
      result.status === "cancelled") &&
    date(result.createdAt) &&
    text(result.fulfillment) &&
    [
      result.notes,
      result.cancelReason,
      result.externalId,
      result.customerName,
      result.tableName,
    ].every(optionalText) &&
    [
      result.totalAmount,
      result.paidAmount,
      result.balanceDue,
      result.localCollected,
      result.platformCollected,
    ].every(amount) &&
    Array.isArray(result.orders) &&
    result.orders.length > 0 &&
    result.orders.every(validOrder) &&
    Array.isArray(result.payments) &&
    result.payments.every(validPayment)
  );
}

export function saleConfirmationTitle(
  sale: Pick<SaleDetail, "status" | "totalAmount">,
) {
  if (sale.status === "cancelled") return "Venta anulada";
  if (sale.status === "open") return "Venta pendiente de cobro";
  return integer(sale.totalAmount) === 0n ? "Venta sin cargo" : "Venta cobrada";
}
