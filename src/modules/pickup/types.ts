import type { PickupState } from "./state";
export type LocatorHistory = {
  id: string;
  number: number;
  assignedBy: string;
  assignedAt: string;
  returnedBy: string | null;
  returnedAt: string | null;
};
export type LocatorFleet = {
  count: number;
  publicPath: string;
  occupied: {
    id: string;
    number: number;
    orderId: string;
    saleId: string;
    label: string;
    cancelled: boolean;
  }[];
};
export type PublicQueue = {
  branchName: string;
  rows: {
    label: string;
    locatorNumber: number | null;
    customerName: string | null;
    state: PickupState;
  }[];
  nextOffset: number;
};
