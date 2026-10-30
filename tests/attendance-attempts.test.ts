import { expect, it } from "vitest";
import { AttendanceAttempts } from "@/components/attendance/attempts";
it("keeps a lost-response retry stable but gives a subsequent same-kind punch its own identity", () => {
  const attempts = new AttendanceAttempts(),
    punch = { action: "punch", kind: "pause" };
  const first = attempts.begin(punch, "2026-10-29:entry-1");
  expect(
    attempts.begin(
      { ...punch, location: { measuredAt: "fresh" }, verificationId: "new" },
      "2026-10-29:entry-1",
    ),
  ).toBe(first);
  const next = attempts.begin(punch, "2026-10-29:resume-1");
  expect(next).not.toBe(first);
  expect(attempts.begin(punch, "2026-10-29:resume-1")).toBe(next);
  const reentry = {
    action: "punch",
    kind: "entry",
    assignmentId: "same-shift",
  };
  expect(attempts.begin(reentry, "2026-10-29:exit-2")).not.toBe(
    attempts.begin(reentry, "2026-10-29:exit-1"),
  );
});
