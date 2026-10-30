import { createHmac, timingSafeEqual } from "node:crypto";
import { AppError } from "@/lib/errors";
import { attendanceQrCodePattern } from "./qr-link";

const WINDOW_MS = 60000;
function sign(body: string, secret: string) {
  if (secret.length < 32)
    throw new AppError(
      "QR_CONFIG",
      "Administración debe completar la configuración del QR.",
      503,
    );
  return createHmac("sha256", secret)
    .update("kybo-attendance-qr:v1:" + body)
    .digest("base64url");
}
function invalid() {
  return new AppError(
    "ATTENDANCE_QR_INVALID",
    "El QR no es válido. Escaneá el código actual del local.",
    400,
  );
}
export function issueAttendanceQr(
  branchId: string,
  revision: number,
  secret: string,
  now = new Date(),
) {
  const slot = Math.floor(now.getTime() / WINDOW_MS);
  if (
    !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/.test(branchId) ||
    !Number.isSafeInteger(revision) ||
    revision < 1 ||
    revision > 999999999 ||
    !Number.isSafeInteger(slot) ||
    slot < 1
  )
    throw invalid();
  const body = `1.${branchId}.${revision}.${slot}`;
  return {
    code: `${body}.${sign(body, secret)}`,
    expiresAt: new Date((slot + 1) * WINDOW_MS).toISOString(),
  };
}
export function readAttendanceQr(
  code: string,
  secret: string,
  now = new Date(),
) {
  if (!attendanceQrCodePattern.test(code)) throw invalid();
  const [version, branchId, revision, slot, signature] = code.split(".");
  const expected = sign(`${version}.${branchId}.${revision}.${slot}`, secret);
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(signature)))
    throw invalid();
  if (
    !Number.isFinite(now.getTime()) ||
    Number(slot) !== Math.floor(now.getTime() / WINDOW_MS)
  )
    throw new AppError(
      "ATTENDANCE_QR_EXPIRED",
      "El código venció. Escaneá el QR actual del local.",
      409,
    );
  return {
    branchId,
    revision: Number(revision),
    slot: Number(slot),
    expiresAt: new Date((Number(slot) + 1) * WINDOW_MS),
  };
}
