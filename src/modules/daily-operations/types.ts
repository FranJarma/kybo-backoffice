export type TaskState =
  | "pending"
  | "in_progress"
  | "blocked"
  | "awaiting_review"
  | "done"
  | "cancelled"
  | "superseded";
export type TaskKind = "transfer" | "production" | "purchase" | "count";
export type Urgency = "critical" | "high" | "scheduled";
export type TaskRow = {
  id: string;
  revision: number;
  kind: TaskKind;
  state: TaskState;
  urgency: Urgency;
  title: string;
  reason: string;
  quantity: string | null;
  unit: string | null;
  itemId: string | null;
  locationId: string | null;
  locationName: string | null;
  originLocationId: string | null;
  originName: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  assigneeUnavailable: boolean;
  materials: { itemId: string; name: string; quantity: string; unit: string }[];
  dueAt: string | null;
  documentId: string | null;
  documentRevision: number | null;
  createdAt: string;
  updatedAt: string;
  dependencyIds: string[];
};
export type StockRow = {
  itemId: string;
  itemName: string;
  unit: string;
  locationId: string;
  locationName: string;
  physical: string;
  reserved: string;
  unusable: string;
  available: string;
};
export type DailySnapshot = {
  asOf: string;
  businessDate: string;
  tasks: TaskRow[];
  total: number;
  configurationWarnings: string[];
  stock: StockRow[];
  people: { id: string; name: string }[];
  locations: { id: string; name: string }[];
  summary: Record<Urgency, number>;
  canManage: boolean;
};
