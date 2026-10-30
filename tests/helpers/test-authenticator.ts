// Test-only software authenticator. Production never imports this helper.
import {
  createHash,
  generateKeyPairSync,
  randomBytes,
  sign,
} from "node:crypto";
import { isoCBOR } from "@simplewebauthn/server/helpers";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";
export function testAuthenticator(
  rpId = "kybo.example",
  origin = "https://kybo.example",
) {
  const pair = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  const jwk = pair.publicKey.export({ format: "jwk" });
  const id = randomBytes(32).toString("base64url");
  const key = isoCBOR.encode(
    new Map<number, number | Uint8Array>([
      [1, 2],
      [3, -7],
      [-1, 1],
      [-2, Buffer.from(jwk.x!, "base64url")],
      [-3, Buffer.from(jwk.y!, "base64url")],
    ]),
  );
  const rpHash = createHash("sha256").update(rpId).digest();
  let counter = 0;
  return {
    id,
    publicKey: Buffer.from(key).toString("base64url"),
    registration(challenge: string, verified = true): RegistrationResponseJSON {
      const credential = Buffer.from(id, "base64url"),
        size = Buffer.alloc(2);
      size.writeUInt16BE(credential.length);
      const authData = Buffer.concat([
        rpHash,
        Buffer.from([verified ? 0x45 : 0x41]),
        Buffer.alloc(4),
        Buffer.alloc(16),
        size,
        credential,
        Buffer.from(key),
      ]);
      const attestationObject = isoCBOR.encode(
        new Map<string, string | Map<string, never> | Uint8Array>([
          ["fmt", "none"],
          ["attStmt", new Map<string, never>()],
          ["authData", authData],
        ]),
      );
      return {
        id,
        rawId: id,
        type: "public-key",
        authenticatorAttachment: "platform",
        clientExtensionResults: {},
        response: {
          clientDataJSON: Buffer.from(
            JSON.stringify({
              type: "webauthn.create",
              challenge,
              origin,
              crossOrigin: false,
            }),
          ).toString("base64url"),
          attestationObject:
            Buffer.from(attestationObject).toString("base64url"),
          transports: ["internal"],
        },
      };
    },
    assertion(challenge: string, verified = true): AuthenticationResponseJSON {
      const count = Buffer.alloc(4);
      count.writeUInt32BE(++counter);
      const authenticatorData = Buffer.concat([
        rpHash,
        Buffer.from([verified ? 0x05 : 0x01]),
        count,
      ]);
      const clientData = Buffer.from(
        JSON.stringify({
          type: "webauthn.get",
          challenge,
          origin,
          crossOrigin: false,
        }),
      );
      const signature = sign(
        "sha256",
        Buffer.concat([
          authenticatorData,
          createHash("sha256").update(clientData).digest(),
        ]),
        pair.privateKey,
      );
      return {
        id,
        rawId: id,
        type: "public-key",
        authenticatorAttachment: "platform",
        clientExtensionResults: {},
        response: {
          clientDataJSON: clientData.toString("base64url"),
          authenticatorData: authenticatorData.toString("base64url"),
          signature: signature.toString("base64url"),
        },
      };
    },
  };
}
