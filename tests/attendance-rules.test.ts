import { describe, expect, it } from "vitest";
import {
  assignmentWindow,
  evaluateLocation,
  summarizeAttendance,
  validateTimeline,
} from "@/modules/attendance/rules";

const now = new Date("2026-10-29T15:00:00Z");
const settings = {
  latitude: -26.83,
  longitude: -65.2,
  radiusMeters: 100,
  maxAccuracyMeters: 40,
};
const evidence = {
  latitude: -26.83,
  longitude: -65.2,
  accuracy: 12,
  measuredAt: now.toISOString(),
};
const event = (
  kind: "entry" | "pause" | "resume" | "exit",
  hour: string,
  branchId = "a",
) => ({
  id: kind + hour,
  kind,
  branchId,
  occurredAt: new Date("2026-10-29T" + hour + ":00Z"),
});

describe("location required at the moment of a punch", () => {
  it("accepts a recent accurate reading and reports server-computed distance", () =>
    expect(evaluateLocation(settings, evidence, now).distanceMeters).toBe(0));
  it.each([
    ["outside the zone", { ...evidence, latitude: -26.82 }],
    [
      "accuracy circle crosses the radius",
      { ...evidence, latitude: -26.8292, accuracy: 30 },
    ],
    ["insufficient accuracy", { ...evidence, accuracy: 80 }],
    ["non finite latitude", { ...evidence, latitude: NaN }],
    ["invalid longitude", { ...evidence, longitude: 181 }],
    ["negative accuracy", { ...evidence, accuracy: -1 }],
    ["zero accuracy", { ...evidence, accuracy: 0 }],
    ["old reading", { ...evidence, measuredAt: "2026-10-29T14:59:29Z" }],
    ["future reading", { ...evidence, measuredAt: "2026-10-29T15:00:11Z" }],
    ["invalid timestamp", { ...evidence, measuredAt: "yesterday" }],
  ])("rejects %s", (_, data) =>
    expect(() => evaluateLocation(settings, data, now)).toThrow(),
  );
  it("does not treat missing coordinates or disabled policies as configured", () =>
    expect(() =>
      evaluateLocation({ ...settings, latitude: null }, evidence, now),
    ).toThrow());
});

describe("chronological attendance state", () => {
  it("accepts entry, multiple pauses and exit", () =>
    expect(
      validateTimeline([
        event("entry", "09:00"),
        event("pause", "12:00"),
        event("resume", "12:30"),
        event("pause", "14:00"),
        event("resume", "14:05"),
        event("exit", "17:00"),
      ]),
    ).toMatchObject({ state: "out" }));
  it.each([
    ["double entry", [event("entry", "09:00"), event("entry", "09:10")]],
    ["pause outside work", [event("pause", "12:00")]],
    ["exit without entry", [event("exit", "17:00")]],
    [
      "resume without pause",
      [event("entry", "09:00"), event("resume", "12:30")],
    ],
    [
      "second pause",
      [
        event("entry", "09:00"),
        event("pause", "12:00"),
        event("pause", "12:05"),
      ],
    ],
    [
      "exit with pause left open",
      [
        event("entry", "09:00"),
        event("pause", "12:00"),
        event("exit", "17:00"),
      ],
    ],
    [
      "another branch while open",
      [event("entry", "09:00", "a"), event("exit", "17:00", "b")],
    ],
  ])("rejects %s", (_, events) =>
    expect(() => validateTimeline(events)).toThrow(),
  );
  it("aggregates actual spans, excluding gaps and without treating a reentry as a new late arrival", () => {
    const result = summarizeAttendance(
      [
        event("entry", "09:00"),
        event("pause", "12:00"),
        event("resume", "12:30"),
        event("exit", "13:00"),
        event("entry", "14:00"),
        event("exit", "17:00"),
      ],
      now,
    );
    expect(result).toMatchObject({
      presenceMinutes: 420,
      pauseMinutes: 30,
      netMinutes: 390,
      interruptionsMinutes: 60,
      provisional: false,
    });
    expect(new Date(result.firstEntry!).toISOString()).toBe(
      "2026-10-29T09:00:00.000Z",
    );
  });
  it("keeps open totals provisional without manufacturing an exit", () =>
    expect(
      summarizeAttendance(
        [event("entry", "09:00"), event("pause", "14:00")],
        now,
      ),
    ).toMatchObject({
      presenceMinutes: 360,
      pauseMinutes: 60,
      netMinutes: 300,
      provisional: true,
      lastExit: null,
    }));
  it("measures overnight spans by instants, not clock subtraction", () => {
    const events = [
      event("entry", "23:00"),
      {
        ...event("exit", "02:00"),
        occurredAt: new Date("2026-10-30T02:00:00Z"),
      },
    ];
    expect(
      summarizeAttendance(events, new Date("2026-10-30T03:00:00Z")),
    ).toMatchObject({
      presenceMinutes: 180,
      netMinutes: 180,
      provisional: false,
    });
  });
});

describe("branch local schedule snapshots", () => {
  it("interprets a configured morning in the branch zone", () =>
    expect(
      assignmentWindow(
        {
          date: "2026-10-29",
          start: "09:00",
          end: "17:00",
          overnight: false,
          pauseMinutes: 30,
        },
        "America/Argentina/Buenos_Aires",
      ),
    ).toMatchObject({
      startsAt: "2026-10-29T12:00:00.000Z",
      endsAt: "2026-10-29T20:00:00.000Z",
      durationMinutes: 480,
    }));
  it("requires explicit overnight and rejects a pause longer than the shift", () => {
    expect(() =>
      assignmentWindow(
        {
          date: "2026-10-29",
          start: "23:00",
          end: "02:00",
          overnight: false,
          pauseMinutes: 30,
        },
        "UTC",
      ),
    ).toThrow();
    expect(
      assignmentWindow(
        {
          date: "2026-10-29",
          start: "23:00",
          end: "02:00",
          overnight: true,
          pauseMinutes: 30,
        },
        "UTC",
      ).durationMinutes,
    ).toBe(180);
    expect(() =>
      assignmentWindow(
        {
          date: "2026-10-29",
          start: "09:00",
          end: "10:00",
          overnight: false,
          pauseMinutes: 60,
        },
        "UTC",
      ),
    ).toThrow();
  });
  it("rejects invalid dates and shifts of 24 hours or longer", () => {
    expect(() =>
      assignmentWindow(
        {
          date: "2026-02-30",
          start: "09:00",
          end: "17:00",
          overnight: false,
          pauseMinutes: 30,
        },
        "UTC",
      ),
    ).toThrow();
    expect(() =>
      assignmentWindow(
        {
          date: "2026-10-29",
          start: "09:00",
          end: "17:00",
          overnight: true,
          pauseMinutes: 30,
        },
        "UTC",
      ),
    ).toThrow();
  });
});
