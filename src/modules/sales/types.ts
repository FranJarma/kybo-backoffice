export type SaleOrigin = "counter" | "table" | "delivery";
export type SaleChannel = "counter" | "pedidosya" | "ubereats";
export type SaleStatus = "open" | "closed" | "cancelled";
export type SaleSummary = {
  id: string;
  number: number;
  revision: number;
  origin: SaleOrigin;
  channel: SaleChannel;
  fulfillment: string;
  status: SaleStatus;
  tableId: string | null;
  tableName: string | null;
  customerId: string | null;
  customerName: string | null;
  externalId: string | null;
  totalAmount: string;
  paidAmount: string;
  balanceDue: string;
  localCollected: string;
  platformCollected: string;
  orderCount: number;
  businessDate: string;
  createdAt: string;
  closedAt: string | null;
};
export type SaleLine = {
  compositionStatus: string;
  modifiers: import("@/modules/modifiers/types").ResolvedModifier[];
  id: string;
  productId: string;
  name: string;
  quantity: number;
  listPrice: string | null;
  unitPrice: string;
  lineTotal: string;
  priceReason: string | null;
  notes: string | null;
  recipeVersionId: string | null;
};
export type SalePayment = {
  id: string;
  kind: "collection" | "refund";
  collector: "local" | "platform";
  methodName: string | null;
  amount: string;
  reference: string | null;
  originalPaymentId: string | null;
  createdAt: string;
  actorId: string;
};
export type SaleDetail = SaleSummary & {
  notes: string | null;
  cancelReason: string | null;
  orders: {
    id: string;
    sequence: number;
    totalAmount: string;
    notes: string | null;
    createdAt: string;
    lines: SaleLine[];
  }[];
  payments: SalePayment[];
};
export type SaleList = { rows: SaleSummary[]; total: number; offset: number };
export type SaleLookup = {
  categories?: { id: string; name: string }[];
  offset?: number;
  rows: {
    id: string;
    name: string;
    price?: string | null;
    imageAssetId?: string | null;
    description?: string | null;
    categoryId?: string | null;
    temporarilySoldOut?: boolean;
    fulfillmentVersionId?: string | null;
  }[];
  total: number;
};
export type TableView = {
  id: string;
  name: string;
  capacity: number;
  x: number;
  y: number;
  revision: number;
  archived: boolean;
  saleId: string | null;
  saleNumber: number | null;
  balanceDue: string | null;
  orderCount: number;
};
export const channelLabels: Record<SaleChannel, string> = {
  counter: "Local",
  pedidosya: "PedidosYa",
  ubereats: "Uber Eats",
};
export const originLabels: Record<SaleOrigin, string> = {
  counter: "Mostrador",
  table: "Mesa",
  delivery: "Delivery",
};
export const statusLabels: Record<SaleStatus, string> = {
  open: "Pendiente de cobro",
  closed: "Cobrada",
  cancelled: "Anulada",
};
