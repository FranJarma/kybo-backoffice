import type { PrepTask } from "@/modules/preparation/types";
import type { PreparationGuide } from "@/modules/recipes/preparation-guide";

export type StaffPreparationTask = PrepTask & {
  canStart: boolean;
  canReady: boolean;
  orderReady: boolean;
};
export type StaffProductionOrder = {
  id: string;
  revision: number;
  state: "planned" | "confirmed";
  name: string;
  baseUnit: string;
  plannedQuantity: string;
  scheduledFor: string | null;
  notes: string | null;
  locationId: string;
  locationName: string;
  preparation: PreparationGuide | null;
  components: {
    itemId: string;
    name: string;
    baseUnit: string;
    quantity: string;
  }[];
};
export type StaffWorkSnapshot = {
  ready: boolean;
  branch: { id: string; name: string; timeZone: string };
  actorId: string;
  serverNow: string;
  assignments: {
    assignmentId: string;
    stationId: string | null;
    stationName: string;
    businessDate: string;
    startsAt: string;
    endsAt: string;
  }[];
  preparation: { rows: StaffPreparationTask[]; hasMore: boolean };
  production: { rows: StaffProductionOrder[]; hasMore: boolean };
};
