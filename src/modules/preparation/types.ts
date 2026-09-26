import type { SaleOrigin, SaleChannel } from "@/modules/sales/types";
export type PrepStatus =
  "pending" | "preparing" | "ready" | "delivered" | "cancelled";
export const prepLabels: Record<PrepStatus, string> = {
  pending: "Pendiente",
  preparing: "En preparación",
  ready: "Listo",
  delivered: "Entregado",
  cancelled: "Cancelado",
};
export type Timing = {
  waitSeconds: number | null;
  prepSeconds: number | null;
  handoffSeconds: number | null;
  totalSeconds: number | null;
};
export type Station = {
  id: string;
  name: string;
  revision: number;
  archived: boolean;
};
export type PrepTask = {
  id: string;
  revision: number;
  orderId: string;
  saleId: string;
  saleNumber: number;
  sequence: number;
  origin: SaleOrigin;
  channel: SaleChannel;
  tableName: string | null;
  externalId: string | null;
  fulfillment: string;
  customerName: string | null;
  notes: string | null;
  saleCancelled: boolean;
  stationId: string | null;
  stationName: string;
  status: PrepStatus;
  assigneeId: string | null;
  assigneeName: string | null;
  enqueuedAt: string;
  startedAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  lines: { id: string; name: string; quantity: number; notes: string | null }[];
  siblings: { id: string; stationName: string; status: PrepStatus }[];
  timing: Timing;
  orderTiming: Timing;
};
export type PrepDetail = {
  task: PrepTask;
  events: {
    id: string;
    revision: number;
    action: string;
    actorId: string;
    actorName: string;
    assigneeId: string | null;
    reason: string | null;
    createdAt: string;
  }[];
};
export type PrepList = {
  rows: PrepTask[];
  total: number;
  offset: number;
  counts: Record<PrepStatus, number>;
  serverNow: string;
  stations: Station[];
};
export type PrepSettings = {
  stations: Station[];
  products: {
    id: string;
    name: string;
    archived: boolean;
    revision: number;
    stationId: string | null;
  }[];
  total: number;
  offset: number;
};
export type PrepMetrics = {
  date: string;
  orders: number;
  sample: number;
  byOrigin: Record<SaleOrigin, number>;
  averages: Timing;
};
export const activeStates = ["pending", "preparing", "ready"];
