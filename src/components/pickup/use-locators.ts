"use client";
import { useEffect, useState } from "react";
import { getJson } from "@/components/inventory/shared";
import type { LocatorFleet } from "@/modules/pickup/types";

export function useLocators(refresh: number) {
  const [fleet, setFleet] = useState<LocatorFleet>();
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    async function load() {
      try {
        const result = await getJson<LocatorFleet>("/api/pickup");
        if (live) {
          setFleet(result);
          setError("");
        }
      } catch {
        if (live)
          setError("No se pudo actualizar la disponibilidad de localizadores.");
      } finally {
        if (live) timer = setTimeout(load, 5000);
      }
    }
    void load();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [refresh]);
  return { fleet, error };
}
