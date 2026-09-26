export type ReceiptLineInput = {
  ingredientId: string;
  ingredientRevision?: number;
  presentationId?: string | null;
  presentationRevision?: number;
  quantity: string;
  unitPrice?: string | null;
  discount?: string;
  lotCode?: string | null;
  expiresOn?: string | null;
};
export type ReceiveInput = {
  requestId: string;
  supplierId: string;
  receivedOn: string;
  documentNumber?: string | null;
  notes?: string | null;
  lines: ReceiptLineInput[];
};
export type PaymentInput = {
  requestId: string;
  paymentMethodId: string;
  paidOn: string;
  amount: string;
  reference?: string | null;
};
export type AdjustmentInput =
  | {
      requestId: string;
      kind: "opening";
      ingredientId: string;
      quantity: string;
      unitCost?: string | null;
      receivedOn: string;
      expiresOn?: string | null;
      lotCode?: string | null;
      reason: string;
    }
  | {
      requestId: string;
      kind: "waste";
      lotId: string;
      revision: number;
      quantity: string;
      reason: string;
    }
  | {
      requestId: string;
      kind: "count";
      lotId: string;
      revision: number;
      countedQuantity: string;
      reason: string;
    }
  | {
      requestId: string;
      kind: "block";
      lotId: string;
      revision: number;
      blocked: boolean;
      reason: string;
    };

export type ReceiptSummary = {
  id: string;
  supplierId: string;
  supplierName: string;
  receivedOn: string;
  documentNumber: string | null;
  totalAmount: string | null;
  paidAmount: string;
  balanceDue: string | null;
  lineCount: number;
  createdAt: string;
};
export type ReceiptLine = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  baseUnit: string;
  presentationId: string | null;
  presentationName: string | null;
  conversionFactor: string;
  quantity: string;
  baseQuantity: string;
  unitPrice: string | null;
  discount: string;
  lineTotal: string | null;
  lotId: string;
  lotCode: string | null;
  expiresOn: string | null;
};
export type PurchasePayment = {
  id: string;
  paymentMethodName: string;
  amount: string;
  paidOn: string;
  reference: string | null;
  createdAt: string;
};
export type ReceiptDetail = ReceiptSummary & {
  notes: string | null;
  lines: ReceiptLine[];
  payments: PurchasePayment[];
};
export type StockRow = {
  ingredientId: string;
  name: string;
  baseUnit: string;
  archived: boolean;
  physicalQuantity: string;
  usableQuantity: string;
  expiredQuantity: string;
  blockedQuantity: string;
  undatedQuantity: string;
  stockValue: string | null;
  averageCost: string | null;
};
export type StockResult = {
  rows: StockRow[];
  total: number;
  asOf: string;
  businessDate: string;
};
export type LotRow = {
  id: string;
  ingredientId: string;
  ingredientName: string;
  baseUnit: string;
  receiptId: string | null;
  receivedOn: string;
  expiresOn: string | null;
  lotCode: string | null;
  initialQuantity: string;
  remainingQuantity: string;
  blocked: boolean;
  expired: boolean;
  revision: number;
  createdAt: string;
};
export type MovementRow = {
  id: string;
  lotId: string;
  ingredientId: string;
  kind:
    | "receipt"
    | "opening"
    | "waste"
    | "count"
    | "production_in"
    | "production_out";
  delta: string;
  unitCost: string | null;
  valueDelta: string | null;
  reason: string | null;
  referenceId: string;
  actorName: string;
  createdAt: string;
};
