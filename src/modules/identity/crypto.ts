import {
  createHash,
  createHmac,
  createCipheriv,
  createDecipheriv,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { AppError } from "@/lib/errors";
function canonical(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, item]) => [key, canonical(item)]),
    );
  return value;
}
export function canonicalHash(value: unknown) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
function key(secret: string) {
  if (secret.length < 32)
    throw new AppError(
      "IDENTITY_CONFIG",
      "Falta configurar la protección de credenciales del servidor.",
      503,
    );
  return createHash("sha256")
    .update("kybo-attendance-codes:" + secret)
    .digest();
}
export function hashCode(code: string, requestId: string, secret: string) {
  return createHmac("sha256", key(secret))
    .update(requestId + ":" + code)
    .digest("hex");
}
export function codeMatches(
  code: string,
  requestId: string,
  hash: string,
  secret: string,
) {
  const actual = Buffer.from(hashCode(code, requestId, secret), "hex"),
    expected = Buffer.from(hash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function sealCode(code: string, requestId: string, secret: string) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  cipher.setAAD(Buffer.from(requestId));
  const encrypted = Buffer.concat([
    cipher.update(code, "utf8"),
    cipher.final(),
  ]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString(
    "base64url",
  );
}
export function unsealCode(value: string, requestId: string, secret: string) {
  const data = Buffer.from(value, "base64url");
  const cipher = createDecipheriv(
    "aes-256-gcm",
    key(secret),
    data.subarray(0, 12),
  );
  cipher.setAAD(Buffer.from(requestId));
  cipher.setAuthTag(data.subarray(12, 28));
  return Buffer.concat([
    cipher.update(data.subarray(28)),
    cipher.final(),
  ]).toString("utf8");
}
export function relyingParty(value: string) {
  const url = new URL(value);
  if (
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
      ))
  )
    throw new AppError(
      "IDENTITY_CONFIG",
      "La verificación del celular requiere el origen HTTPS configurado de Kybo.",
      503,
    );
  return { origin: url.origin, rpId: url.hostname };
}
