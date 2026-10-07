export type Decimal = string;
export type OperationalContext = {
  actorId: string;
  branchId: string;
  timeZone: string;
  role: "admin" | "manager" | "staff";
};
export type CommandMeta = { requestId: string; expectedRevision?: number };
export type OperationResult = {
  operationId: string;
  revision: number;
  replayed: boolean;
};
export type StockAllocation = {
  itemId: string;
  lotId: string;
  locationId: string;
  quantity: Decimal;
};
export type StockOrigin =
  | { kind: "receipt"; receiptId: string }
  | { kind: "sale"; saleLineId: string }
  | { kind: "production"; productionOrderId: string }
  | { kind: "transfer"; transferId: string }
  | { kind: "adjustment"; adjustmentId: string }
  | { kind: "internal_use"; internalUseId: string }
  | { kind: "return"; returnId: string };
