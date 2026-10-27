export type TransferAllocation = {
  id: string;
  itemName: string;
  baseUnit: string;
  quantity: string;
  received: string;
  resolved: string;
};
export type TransferRecord = {
  id: string;
  originBranchId: string;
  destinationBranchId: string;
  originLocationId: string;
  destinationLocationId: string;
  reason: string;
  state: string;
  revision: number;
  allocations: TransferAllocation[];
};
export type TransferDirectory = {
  hasMore: boolean;
  branchId: string;
  destinations: {
    id: string;
    name: string;
    branchName: string;
    branchId: string;
  }[];
  destinationPolicies: { itemId: string; locationId: string }[];
  rows: TransferRecord[];
};
