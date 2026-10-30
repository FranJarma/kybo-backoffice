import {
  ATTENDANCE_QR_PATH,
  attendanceQrCodePattern,
  attendanceQrPath,
} from "@/modules/attendance/qr-link";

/** Only explicit personal-work entry points may survive password login. */
export function safeLoginReturn(value: unknown): string {
  if (
    typeof value !== "string" ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    /[\\\u0000-\u0020]/.test(value)
  )
    return "/";
  try {
    const url = new URL(value, "https://kybo.invalid");
    if (url.origin !== "https://kybo.invalid" || url.hash) return "/";
    if (
      ["/staff/attendance", "/staff/work", "/"].includes(url.pathname) &&
      !url.search
    )
      return url.pathname;
    const code = url.searchParams.get("code");
    if (
      url.pathname === ATTENDANCE_QR_PATH &&
      code &&
      attendanceQrCodePattern.test(code) &&
      [...url.searchParams.keys()].length === 1
    )
      return attendanceQrPath(code);
  } catch {
    /* Malformed return paths fall back to the ordinary landing page. */
  }
  return "/";
}
