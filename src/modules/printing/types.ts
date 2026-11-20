export type TicketModifier = {
  groupName: string;
  optionName: string;
  count: number;
  instruction: string | null;
};
export type TicketLine = {
  id: string;
  quantity: number;
  name: string;
  comboName: string | null;
  notes: string | null;
  modifiers: TicketModifier[];
};
export type PrintTicket = {
  version: 1;
  branchName: string;
  timeZone: string;
  saleId: string;
  orderId: string;
  saleNumber: number;
  sequence: number;
  occurredAt: string;
  origin: string;
  consumption: string;
  tableName: string | null;
  externalId: string | null;
  customerName: string | null;
  locatorNumber: number | null;
  stationId: string | null;
  stationName: string;
  notes: string | null;
  otherStations: string[];
  lines: TicketLine[];
};
export type TicketKind =
  "original" | "copy" | "historical" | "cancellation" | "change" | "test";
export type TicketDocument = {
  version: 1;
  widthDots: 576;
  logo: true;
  lines: {
    text: string;
    style: "normal" | "bold" | "title" | "heading" | "small";
    align?: "left" | "center";
  }[];
};
export type PrintState =
  | "pending"
  | "leased"
  | "sending"
  | "sent"
  | "error"
  | "uncertain"
  | "review"
  | "cancelled";
export type PrintJobView = {
  id: string;
  ticketId: string;
  saleId: string;
  orderId: string;
  saleNumber: number;
  sequence: number;
  stationName: string;
  kind: TicketKind;
  copyNumber: number;
  state: PrintState;
  createdAt: string;
  sentAt: string | null;
  error: string | null;
  spoolState: string;
  canReprint: boolean;
  canRetry: boolean;
  reason: string | null;
  requestedBy: string;
  document: TicketDocument;
};
export type PrintingSnapshot = {
  ready: boolean;
  canConfigure: boolean;
  canManage: boolean;
  settings: { enabled: boolean; revision: number; printerName: string } | null;
  connector: {
    id: string;
    name: string;
    connected: boolean;
    lastSeenAt: string | null;
    printerStatus: string;
    printerMessage: string | null;
  } | null;
  jobs: PrintJobView[];
  message?: string;
};
