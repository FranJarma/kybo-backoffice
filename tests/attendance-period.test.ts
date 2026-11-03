import { expect, it } from "vitest";
import { schedulePeriodDates } from "@/modules/attendance/period";

it("expands selected weekdays across several weeks in calendar order", () => {
  expect(
    schedulePeriodDates({
      from: "2026-11-02",
      to: "2026-11-15",
      weekdays: [5, 1, 3],
    }),
  ).toEqual([
    "2026-11-02",
    "2026-11-04",
    "2026-11-06",
    "2026-11-09",
    "2026-11-11",
    "2026-11-13",
  ]);
  expect(
    schedulePeriodDates({
      from: "2026-11-08",
      to: "2026-11-08",
      weekdays: [0],
    }),
  ).toEqual(["2026-11-08"]);
});

it("accepts exactly 90 calendar days and rejects the next day", () => {
  const input = {
    from: "2026-11-01",
    to: "2027-01-29",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
  };
  expect(schedulePeriodDates(input)).toHaveLength(90);
  expect(() => schedulePeriodDates({ ...input, to: "2027-01-30" })).toThrow(
    /90/,
  );
});

it.each([
  { from: "2026-02-30", to: "2026-03-02", weekdays: [1] },
  { from: "2026-11-03", to: "2026-11-02", weekdays: [1] },
  { from: "2026-11-02", to: "2027-02-01", weekdays: [1] },
  { from: "2026-11-02", to: "2026-11-03", weekdays: [] },
  { from: "2026-11-02", to: "2026-11-03", weekdays: [9] },
  { from: "2026-11-02", to: "2026-11-03", weekdays: [0] },
])("rejects invalid, excessive or empty periods: %j", (input) => {
  expect(() => schedulePeriodDates(input)).toThrow();
});
