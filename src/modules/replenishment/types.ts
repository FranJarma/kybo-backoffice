export type ReplenishmentPolicy = {
  id: string;
  revision: number;
  itemId: string;
  itemName: string;
  baseUnit: string;
  locationId: string;
  locationName: string;
  minimumQuantity: string;
  targetQuantity: string;
  preparationMinutes: number | null;
  enabled: boolean;
};

export type ReplenishmentAlert = Omit<
  ReplenishmentPolicy,
  "revision" | "enabled"
> & {
  kind: "transfer" | "production" | "purchase";
  severity: "low" | "empty";
  availableQuantity: string;
  /** Shortfall to target; transfers are capped by usable stock in source locations. */
  suggestedQuantity: string;
  sources: {
    locationId: string;
    locationName: string;
    availableQuantity: string;
  }[];
  activeProduction: {
    id: string;
    plannedQuantity: string;
    state: string;
    assignedToName: string | null;
    startedAt?: string | null;
  }[];
};

export type ReplenishmentSnapshot = {
  policies: ReplenishmentPolicy[];
  alerts: ReplenishmentAlert[];
  locations: { id: string; name: string }[];
  items: { id: string; name: string; baseUnit: string }[];
  asOf: string;
};
