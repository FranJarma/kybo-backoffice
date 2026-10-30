import { expect, it } from "vitest";
import { compareAssignment, summarizeDays } from "@/modules/attendance/reports";
const event = (
  id: string,
  kind: "entry" | "pause" | "resume" | "exit",
  at: string,
  day = "2026-10-29",
) => ({
  id,
  kind,
  occurredAt: at,
  branchId: "branch",
  businessDate: day,
  assignmentId: "shift",
});
it("compares the first entry and final exit across reentries to one assigned shift", () => {
  const rows = [
    event("1", "entry", "2026-10-29T12:05:00Z"),
    event("2", "exit", "2026-10-29T15:00:00Z"),
    event("3", "entry", "2026-10-29T16:00:00Z"),
    event("4", "pause", "2026-10-29T17:00:00Z"),
    event("5", "resume", "2026-10-29T17:40:00Z"),
    event("6", "exit", "2026-10-29T20:10:00Z"),
  ];
  expect(
    compareAssignment(
      rows,
      {
        id: "shift",
        startsAt: "2026-10-29T12:00:00Z",
        endsAt: "2026-10-29T20:00:00Z",
        pauseMinutes: 30,
      },
      new Date("2026-10-29T21:00:00Z"),
    ),
  ).toMatchObject({
    entryDifference: 5,
    exitDifference: 10,
    pauseDifference: 10,
    total: { interruptionsMinutes: 60 },
  });
});
it("does not count the gap between separate business days as an interruption", () => {
  const rows = [
    event("1", "entry", "2026-10-28T12:00:00Z", "2026-10-28"),
    event("2", "exit", "2026-10-28T20:00:00Z", "2026-10-28"),
    event("3", "entry", "2026-10-29T12:00:00Z"),
    event("4", "exit", "2026-10-29T20:00:00Z"),
  ];
  expect(summarizeDays(rows, new Date("2026-10-29T21:00:00Z"))).toMatchObject({
    presenceMinutes: 960,
    interruptionsMinutes: 0,
    netMinutes: 960,
    provisional: false,
  });
});
it("keeps missing or open shift comparisons provisional rather than inventing attendance", () => {
  const assignment = {
    id: "shift",
    startsAt: "2026-10-29T12:00:00Z",
    endsAt: "2026-10-29T20:00:00Z",
    pauseMinutes: 30,
  };
  expect(
    compareAssignment([], assignment, new Date("2026-10-29T21:00:00Z")),
  ).toMatchObject({
    entryDifference: null,
    exitDifference: null,
    pauseDifference: null,
    needsReview: true,
  });
  expect(
    compareAssignment(
      [event("1", "entry", "2026-10-29T12:00:00Z")],
      assignment,
      new Date("2026-10-29T21:00:00Z"),
    ),
  ).toMatchObject({
    exitDifference: null,
    needsReview: true,
    total: { provisional: true },
  });
});
