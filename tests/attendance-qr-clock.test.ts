import { expect, it } from "vitest";
import {
  qrClientDeadline,
  qrSecondsRemaining,
} from "@/components/attendance/qr-clock";
it("never extends a QR lifetime by network delay or a different phone wall clock", () => {
  const deadline = qrClientDeadline(
    "2026-10-29T15:00:00Z",
    "2026-10-29T15:01:00Z",
    1000,
  );
  expect(qrSecondsRemaining(deadline, 11000)).toBe(50);
  expect(qrSecondsRemaining(deadline, 61000)).toBe(0);
  expect(qrSecondsRemaining(deadline, 90000)).toBe(0);
  expect(qrSecondsRemaining(qrClientDeadline("bad", "bad", 1000), 1000)).toBe(
    0,
  );
});
