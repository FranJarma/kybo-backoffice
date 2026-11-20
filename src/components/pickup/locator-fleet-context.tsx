"use client";

import { createContext } from "react";
import type { LocatorFleet } from "@/modules/pickup/types";

export type LocatorFleetState = {
  fleet?: LocatorFleet;
  error: string;
};

// The provider belongs to one mounted POS. No state is shared across sessions
// or branch workspaces; independent locator managers keep their own resource.
export const LocatorFleetContext = createContext<LocatorFleetState | null>(
  null,
);
export const LocatorFleetProvider = LocatorFleetContext.Provider;
