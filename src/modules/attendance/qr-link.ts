export const ATTENDANCE_QR_PATH = "/staff/attendance/scan";
export const attendanceQrCodePattern =
  /^1\.[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\.[1-9]\d{0,8}\.[1-9]\d{0,11}\.[A-Za-z0-9_-]{43}$/;
export function attendanceQrPath(code: string) {
  return `${ATTENDANCE_QR_PATH}?code=${encodeURIComponent(code)}`;
}
