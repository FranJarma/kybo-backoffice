import type {
  purchaseOrders,
  purchaseOrderLines,
} from "@/db/procurement-schema";
export type PurchaseOrderLine = typeof purchaseOrderLines.$inferSelect & {
  pendingQuantity: string;
};
export type PurchaseOrder = Omit<
  typeof purchaseOrders.$inferSelect,
  "createdAt" | "updatedAt"
> & {
  financial?: PurchaseOrderFinancial;
  createdAt: string;
  updatedAt: string;
  lines: PurchaseOrderLine[];
  receipts: { id: string; receivedOn: string; documentNumber: string | null }[];
};
export type PurchaseAdvanceInput = {
  requestId: string;
  supplierId: string;
  expectedRevision: number;
  paymentMethodId: string;
  paidOn: string;
  amount: string;
  source: "cash" | "external";
  reference?: string | null;
};
export type PurchaseOrderFinancial = {
  available: boolean;
  advancedAmount: string;
  appliedAmount: string;
  availableAmount: string;
  advances: {
    id: string;
    amount: string;
    appliedAmount: string;
    availableAmount: string;
    source: "cash" | "external";
    paymentMethodName: string;
    paidOn: string;
    reference: string | null;
    createdAt: string;
  }[];
};
export type OrderSnapshot = { available: boolean; orders: PurchaseOrder[] };
export type CreateOrderInput = {
  requestId: string;
  supplierId: string;
  orderedOn: string;
  expectedOn: string | null;
  notes: string;
  lines: { itemId: string; presentationId?: string | null; quantity: string }[];
};
export type OrderCommand = { requestId: string; expectedRevision: number } & (
  | { action: "confirm" }
  | { action: "reschedule"; expectedOn: string | null; reason: string }
  | { action: "cancel"; reason: string }
);
