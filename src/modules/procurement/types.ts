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
  createdAt: string;
  updatedAt: string;
  lines: PurchaseOrderLine[];
  receipts: { id: string; receivedOn: string; documentNumber: string | null }[];
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
