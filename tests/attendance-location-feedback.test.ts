import { describe, expect, it } from "vitest";
import { locationFeedback } from "@/components/attendance/location-feedback";
const now = new Date("2026-11-02T15:00:00Z");
const policy = {
  latitude: 0,
  longitude: 0,
  radiusMeters: 100,
  maxAccuracyMeters: 40,
};
const reading = {
  latitude: 0,
  longitude: 0,
  accuracy: 12,
  measuredAt: now.toISOString(),
};

describe("personal attendance proximity feedback", () => {
  it("shows no location requirement only for an explicitly disabled policy", () => {
    expect(
      locationFeedback({ ...policy, requireLocation: false }, null, now).state,
    ).toBe("not-required");
    expect(locationFeedback(policy, null, now).state).toBe("checking");
  });
  it("waits for coordinates before reporting eligibility", () => {
    expect(
      locationFeedback({ ...policy, latitude: null }, reading, now).state,
    ).toBe("unconfigured");
  });
  it("shows an inside state for a recent precise reading", () => {
    expect(locationFeedback(policy, reading, now)).toMatchObject({
      state: "inside",
      distanceMeters: 0,
      accuracyMeters: 12,
    });
  });
  it("reports the distance when outside the allowed radius", () => {
    const result = locationFeedback(
      policy,
      { ...reading, latitude: 0.01 },
      now,
    );
    expect(result.state).toBe("outside");
    expect(result.distanceMeters).toBeGreaterThan(1111);
    expect(result.distanceMeters).toBeLessThan(1113);
  });
  it("uses the accuracy circle, not just the estimated point", () => {
    expect(
      locationFeedback(policy, { ...reading, longitude: 0.0008 }, now).state,
    ).toBe("outside");
  });
  it("never shows green when accuracy exceeds the configured maximum", () => {
    expect(
      locationFeedback(policy, { ...reading, accuracy: 80 }, now).state,
    ).toBe("inaccurate");
  });
  it("expires a reading according to the same 30-second server limit", () => {
    expect(
      locationFeedback(policy, reading, new Date(+now + 30000)).state,
    ).toBe("inside");
    expect(
      locationFeedback(policy, reading, new Date(+now + 30001)).state,
    ).toBe("stale");
    expect(
      locationFeedback(
        policy,
        { ...reading, measuredAt: new Date(+now + 11000).toISOString() },
        now,
      ).state,
    ).toBe("stale");
  });
  it("rejects invalid coordinates instead of calculating a misleading distance", () => {
    const result = locationFeedback(policy, { ...reading, latitude: NaN }, now);
    expect(result.state).toBe("unavailable");
    expect(result.distanceMeters).toBeNull();
  });
  it("distinguishes a location error from an outstanding request", () => {
    expect(
      locationFeedback(policy, null, now, "Permití el acceso a la ubicación."),
    ).toMatchObject({
      state: "unavailable",
      message: "Permití el acceso a la ubicación.",
    });
  });
});
