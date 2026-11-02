"use client";
import { useEffect, useRef, useState } from "react";
import { currentLocation } from "@/components/identity/client";
import {
  locationPolicyConfigured,
  type LocationEvidence,
} from "@/modules/attendance/rules";
import {
  locationFeedback,
  type PhoneLocationPolicy,
} from "./location-feedback";

const hidden = () => document.visibilityState === "hidden";

type Sample = {
  scope: string;
  reading: LocationEvidence | null;
  error: string;
  pending: boolean;
};
export function useLocationFeedback(
  scope: string,
  policy: PhoneLocationPolicy,
  suspended: boolean,
) {
  const key = [
    scope,
    policy.requireLocation,
    policy.latitude,
    policy.longitude,
    policy.radiusMeters,
    policy.maxAccuracyMeters,
  ].join("|");
  const active =
    policy.requireLocation !== false && locationPolicyConfigured(policy);
  const [sample, setSample] = useState<Sample>({
    scope: "",
    reading: null,
    error: "",
    pending: false,
  });
  const [now, setNow] = useState(() => Date.now());
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    let disposed = false,
      pending = false,
      version = 0,
      lastAttempt = 0;
    async function refresh() {
      if (disposed || !active || suspended || pending || hidden()) return;
      pending = true;
      const request = ++version;
      lastAttempt = performance.now();
      setSample((previous) => ({
        scope: key,
        reading: previous.scope === key ? previous.reading : null,
        error: "",
        pending: true,
      }));
      try {
        const reading = await currentLocation();
        if (disposed || request !== version || hidden()) return;
        setNow(Date.now());
        setSample({ scope: key, reading, error: "", pending: false });
      } catch (e) {
        if (disposed || request !== version || hidden()) return;
        setSample({
          scope: key,
          reading: null,
          error:
            e instanceof Error ? e.message : "No pudimos obtener tu ubicación.",
          pending: false,
        });
      } finally {
        if (request === version) pending = false;
      }
    }
    refreshRef.current = refresh;
    if (!active)
      return () => {
        disposed = true;
      };
    const focus = () => {
      setNow(Date.now());
      void refresh();
    };
    const visibility = () => {
      if (hidden()) {
        ++version;
        pending = false;
        setSample({ scope: key, reading: null, error: "", pending: false });
      } else focus();
    };
    void refresh();
    const timer = setInterval(() => {
      if (hidden()) return;
      setNow(Date.now());
      if (performance.now() - lastAttempt >= 20000) void refresh();
    }, 1000);
    window.addEventListener("focus", focus);
    document.addEventListener("visibilitychange", visibility);
    return () => {
      disposed = true;
      ++version;
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      document.removeEventListener("visibilitychange", visibility);
    };
  }, [key, active, suspended]);
  const current =
    sample.scope === key
      ? sample
      : { reading: null, error: "", pending: false };
  return {
    ...locationFeedback(policy, current.reading, new Date(now), current.error),
    pending: current.pending,
    refresh: () => void refreshRef.current(),
  };
}
