import { AppError } from "@/lib/errors";
import {
  evaluateLocation,
  locationDistanceMeters,
  locationPolicyConfigured,
  type LocationEvidence,
  type LocationPolicy,
} from "@/modules/attendance/rules";

export type PhoneLocationPolicy = LocationPolicy & {
  requireLocation?: boolean;
};
export type LocationFeedback = {
  state:
    | "not-required"
    | "checking"
    | "unconfigured"
    | "inside"
    | "outside"
    | "inaccurate"
    | "stale"
    | "unavailable";
  distanceMeters: number | null;
  accuracyMeters: number | null;
  message?: string;
};
export function locationFeedback(
  policy: PhoneLocationPolicy,
  reading: LocationEvidence | null,
  now: Date,
  error = "",
): LocationFeedback {
  const empty = { distanceMeters: null, accuracyMeters: null };
  if (policy.requireLocation === false)
    return { ...empty, state: "not-required" };
  if (!locationPolicyConfigured(policy))
    return { ...empty, state: "unconfigured" };
  if (!reading)
    return {
      ...empty,
      state: error ? "unavailable" : "checking",
      message: error,
    };
  try {
    const result = evaluateLocation(policy, reading, now);
    return {
      state: "inside",
      distanceMeters: result.distanceMeters,
      accuracyMeters: result.accuracyMeters,
    };
  } catch (e) {
    if (!(e instanceof AppError)) throw e;
    if (e.code === "LOCATION_OUTSIDE" || e.code === "LOCATION_ACCURACY")
      return {
        state: e.code === "LOCATION_OUTSIDE" ? "outside" : "inaccurate",
        distanceMeters: locationDistanceMeters(policy, reading),
        accuracyMeters: reading.accuracy,
      };
    return {
      ...empty,
      state: e.code === "LOCATION_STALE" ? "stale" : "unavailable",
      message: e.message,
    };
  }
}
