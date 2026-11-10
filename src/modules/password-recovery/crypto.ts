import {
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";
export const randomCode = () => String(randomInt(1_000_000)).padStart(6, "0");
export const randomGrant = () => randomBytes(32).toString("base64url");
export const recoveryDigest = (secret: string, scope: string, value: string) =>
  createHmac("sha256", secret)
    .update(`kybo-recovery-v1:${scope}:${value}`)
    .digest("hex");
export const codeDigest = (secret: string, challengeId: string, code: string) =>
  recoveryDigest(secret, `code:${challengeId}`, code);
export function emailContactVersion(secret: string, email: string) {
  const bytes = Buffer.from(
    recoveryDigest(secret, "email-contact", email).slice(0, 32),
    "hex",
  );
  bytes[6] = (bytes[6] & 15) | 80;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export const subjectVersion = (
  password: string,
  profileAt: Date,
  accessAt: Date,
) =>
  createHash("sha256")
    .update(
      JSON.stringify([
        password,
        profileAt.toISOString(),
        accessAt.toISOString(),
      ]),
    )
    .digest("hex");
export function matchesDigest(actual: string | null, expected: string) {
  if (
    !actual ||
    !/^[a-f0-9]{64}$/.test(actual) ||
    !/^[a-f0-9]{64}$/.test(expected)
  )
    return false;
  return timingSafeEqual(
    Buffer.from(actual, "hex"),
    Buffer.from(expected, "hex"),
  );
}
