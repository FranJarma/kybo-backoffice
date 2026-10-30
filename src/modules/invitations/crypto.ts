import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
} from "node:crypto";
import { AppError } from "@/lib/errors";
export function invitationSecret() {
  const secret = process.env.BETTER_AUTH_SECRET ?? "";
  if (secret.length < 32)
    throw new AppError(
      "UNAVAILABLE",
      "Falta configurar la protección de invitaciones.",
      503,
    );
  return secret;
}
function key(secret: string) {
  return createHash("sha256")
    .update("kybo-invitations-v1:" + secret)
    .digest();
}
export function invitationHash(value: string, secret: string) {
  return createHmac("sha256", key(secret)).update(value).digest("hex");
}
export function sealInvitation(
  value: unknown,
  generation: string,
  secret: string,
) {
  const iv = randomBytes(12),
    cipher = createCipheriv("aes-256-gcm", key(secret), iv);
  cipher.setAAD(Buffer.from(generation));
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(value)),
    cipher.final(),
  ]);
  return Buffer.concat([iv, encrypted, cipher.getAuthTag()]).toString(
    "base64url",
  );
}
export function unsealInvitation(
  value: string,
  generation: string,
  secret: string,
): unknown {
  const data = Buffer.from(value, "base64url"),
    cipher = createDecipheriv("aes-256-gcm", key(secret), data.subarray(0, 12));
  cipher.setAAD(Buffer.from(generation));
  cipher.setAuthTag(data.subarray(-16));
  return JSON.parse(
    Buffer.concat([
      cipher.update(data.subarray(12, -16)),
      cipher.final(),
    ]).toString("utf8"),
  );
}
