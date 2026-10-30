import { expect, it } from "vitest";
import {
  issueAttendanceQr,
  readAttendanceQr,
} from "@/modules/attendance/qr-token";
import { safeLoginReturn } from "@/lib/login-return";

const branch = "11111111-1111-4111-8111-111111111111";
const secret = "qr-tests-only-a-server-secret-with-32-characters";
const at = new Date("2026-10-29T15:00:00Z");
it("issues a shared branch QR for exactly one minute without invalidating another screen", () => {
  const first = issueAttendanceQr(branch, 2, secret, at);
  expect(first).toEqual(
    issueAttendanceQr(branch, 2, secret, new Date(+at + 59000)),
  );
  expect(first.expiresAt).toBe("2026-10-29T15:01:00.000Z");
  expect(
    readAttendanceQr(first.code, secret, new Date(+at + 59999)),
  ).toMatchObject({ branchId: branch, revision: 2 });
  expect(() =>
    readAttendanceQr(first.code, secret, new Date(+at + 60000)),
  ).toThrow(/venció/i);
  expect(
    issueAttendanceQr(branch, 2, secret, new Date(+at + 60000)).code,
  ).not.toBe(first.code);
});
it("rejects tampering, future windows, another secret and invalid policy input", () => {
  const { code } = issueAttendanceQr(branch, 1, secret, at);
  expect(() =>
    readAttendanceQr(
      code.slice(0, -1) + (code.endsWith("x") ? "y" : "x"),
      secret,
      at,
    ),
  ).toThrow();
  expect(() => readAttendanceQr(code, secret + "other", at)).toThrow();
  expect(() => readAttendanceQr(code, secret, new Date(+at - 1))).toThrow();
  expect(() => issueAttendanceQr(branch, 0, secret, at)).toThrow();
  expect(() => issueAttendanceQr(branch, 1, "short", at)).toThrow();
  expect(() => readAttendanceQr("a".repeat(10000), secret, at)).toThrow();
});
it("preserves only allowed attendance return destinations and never an external redirect", () => {
  const { code } = issueAttendanceQr(branch, 1, secret, at);
  const scan = "/staff/attendance/scan?code=" + encodeURIComponent(code);
  expect(safeLoginReturn(scan)).toBe(scan);
  expect(safeLoginReturn("/staff/work")).toBe("/staff/work");
  for (const value of [
    "//evil.example",
    "https://evil.example",
    "/settings/users",
    "/staff/attendance/scan?code=evil&next=https://evil.example",
    "/\\evil.example",
    "/staff/work?next=evil",
  ])
    expect(safeLoginReturn(value)).toBe("/");
});
