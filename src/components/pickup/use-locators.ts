"use client";
import { useContext, useEffect, useState } from "react";
import type { LocatorFleet } from "@/modules/pickup/types";
import { startLocatorPolling } from "./locator-polling";
import { LocatorFleetContext } from "./locator-fleet-context";

export function useLocators(refresh: number) {
  const provided = useContext(LocatorFleetContext);
  const shared = provided !== null;
  const [fleet, setFleet] = useState<LocatorFleet>();
  const [error, setError] = useState("");
  useEffect(() => {
    if (shared) return;
    return startLocatorPolling({ onFleet: setFleet, onError: setError });
  }, [refresh, shared]);
  return provided ?? { fleet, error };
}
