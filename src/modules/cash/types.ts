import type { Tx } from "@/db/types";
import type { OperationalContext } from "@/modules/operations/types";

export type CashCapabilities = {
  open: boolean;
  close: boolean;
  expense: boolean;
  externalExpense: boolean;
  withdraw: boolean;
  supplier: boolean;
  review: boolean;
  admin: boolean;
};
export type CashSettings = {
  closeTime: string;
  targetFund: string | null;
  revision: number;
};
export type CashStatus = {
  actorId: string;
  available: boolean;
  activated: boolean;
  branchId: string;
  timeZone: string;
  open: boolean;
  sessionId: string | null;
  canOpen: boolean;
  canView: boolean;
  opening: {
    openedByName: string;
    openedAt: string;
    openingCash: string;
  } | null;
};
export type CashLot = {
  number: string;
  closedAt: string;
  operations: number;
  total: string;
  photoId: string;
};
export type CashPosnetInput = {
  mode: "registered" | "pending" | "none";
  reason?: string;
  lots: CashLot[];
};
export type CashPosnetClose = CashPosnetInput & {
  expected: string;
  expectedOperations: number;
  total: string | null;
  operations: number | null;
  difference: string | null;
  needsReview: boolean;
};
export type CashSession = {
  id: string;
  branchId: string;
  businessDate: string;
  state: "open" | "closed";
  openedBy: string;
  openedByName: string;
  openedAt: string;
  openingCash: string;
  openingReason: string;
  closeTime: string;
  targetFund: string | null;
  timeZone: string;
  revision: number;
  closedAt: string | null;
  closedBy: string | null;
  closedByName: string | null;
  expectedClosing: string | null;
  counted: string | null;
  withdrawal: string | null;
  fund: string | null;
  difference: string | null;
  reason: string | null;
  posnet: CashPosnetClose | null;
  posnetReview?: CashPosnetClose | null;
  reviewRequired: boolean;
  reviewedAt: string | null;
  reviewedByName: string | null;
  reviewNote: string | null;
};
export type CashMovement = {
  id: string;
  sessionId: string;
  branchId: string;
  kind: string;
  amount: string;
  methodKind: string;
  methodName: string;
  concept: string;
  reference: string | null;
  sourceType: string;
  sourceId: string;
  actorName: string;
  createdAt: string;
};
export type CashTotals = {
  expectedCash: string;
  opening: string;
  cashCollections: string;
  cashRefunds: string;
  expenses: string;
  supplierPayments: string;
  withdrawals: string;
  cardTotal: string;
  cardOperations: number;
  transferTotal: string;
  otherTotal: string;
};
export type CashSnapshot = {
  available: boolean;
  activated: boolean;
  branchId: string;
  branchName: string;
  timeZone: string;
  capabilities: CashCapabilities;
  settings: CashSettings;
  current: CashSession | null;
  selected: CashSession | null;
  lastClosed: CashSession | null;
  sessions: CashSession[];
  movements: CashMovement[];
  totals: CashTotals;
  pendingReviews: number;
};
export type CashSettingsSnapshot = {
  available: boolean;
  branchId: string;
  branchName: string;
  settings: CashSettings;
  employees: {
    id: string;
    name: string;
    role: string;
    canOpen: boolean;
    canClose: boolean;
    canExpense: boolean;
  }[];
};
export type CashCommand =
  | { action: "open"; amount: string; reason?: string }
  | {
      action: "expense";
      amount: string;
      concept: string;
      category:
        | "rent"
        | "electricity"
        | "utilities"
        | "internet"
        | "payroll"
        | "taxes"
        | "maintenance"
        | "other";
      source?: "cash" | "external";
    }
  | { action: "withdraw"; amount: string; reason: string; recipient: string }
  | {
      action: "close";
      sessionId: string;
      expectedRevision: number;
      counted: string;
      withdrawal: string;
      reason: string;
      posnet: CashPosnetInput;
    }
  | {
      action: "review";
      sessionId: string;
      note: string;
      posnet?: CashPosnetInput;
    };
export type CashSettingsCommand =
  | {
      action: "configure";
      closeTime: string;
      targetFund: string | null;
      revision: number;
    }
  | {
      action: "permission";
      userId: string;
      canOpen: boolean;
      canClose: boolean;
      canExpense: boolean;
    };
export type CashMovementInput = {
  kind:
    "collection" | "refund" | "expense" | "withdrawal" | "supplier" | "advance";
  amount: string;
  sourceType: string;
  sourceId: string;
  methodKind: string;
  methodName: string;
  concept: string;
  reference?: string | null;
  occurredAt?: Date;
};
export type CashRecorder = (
  tx: Tx,
  ctx: OperationalContext,
  input: CashMovementInput,
) => Promise<string | null>;
