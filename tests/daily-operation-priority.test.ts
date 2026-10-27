import { expect, it } from "vitest";
import { classifyUrgency } from "@/modules/daily-operations/priority";
const base = {
  now: new Date("2026-10-22T12:00:00Z"),
  dueAt: null,
  blockedCurrentDemand: false,
  coverageDays: null,
  leadDays: 7,
  safetyDays: 3,
  incomingCoversGap: false,
};
it.each([
  [7, "critical"],
  [10, "high"],
  [11, "scheduled"],
] as const)("coverage %s classifies risk", (coverageDays, urgency) => {
  expect(classifyUrgency({ ...base, coverageDays }).urgency).toBe(urgency);
});
it("timely incoming removes forecast risk but never masks a current shortage", () => {
  expect(
    classifyUrgency({ ...base, coverageDays: 2, incomingCoversGap: true })
      .urgency,
  ).toBe("scheduled");
  expect(
    classifyUrgency({
      ...base,
      blockedCurrentDemand: true,
      incomingCoversGap: true,
    }).urgency,
  ).toBe("critical");
});
it("overdue work is high and unknown coverage is explicit", () => {
  expect(
    classifyUrgency({ ...base, dueAt: new Date("2026-10-21") }),
  ).toMatchObject({ urgency: "high", overdue: true });
  expect(classifyUrgency(base)).toMatchObject({ coverageKnown: false });
});
