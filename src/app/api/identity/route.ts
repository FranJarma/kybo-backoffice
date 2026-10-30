import { z } from "zod";
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from "@simplewebauthn/server";
import { getDb } from "@/db/client";
import { operationalActor } from "@/modules/branches/http";
import {
  requestInput,
  privateJson,
  errorResponse,
} from "@/modules/catalog/http";
import { configuredOrigins } from "@/lib/origins";
import { AppError } from "@/lib/errors";
import { relyingParty } from "@/modules/identity/crypto";
import { identitySchemaReady } from "@/modules/identity/availability";
import {
  beginRegistration,
  beginGuidedRegistration,
  finishRegistration,
  beginVerification,
  finishVerification,
  listCredentials,
  revokeCredential,
} from "@/modules/identity/service";
export const runtime = "nodejs";
const responseSchema = z.custom<
  RegistrationResponseJSON | AuthenticationResponseJSON
>((v) => typeof v === "object" && v !== null && !Array.isArray(v));
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("guided-register-options") }).strict(),
  z
    .object({
      action: z.literal("register-options"),
      password: z.string().min(1).max(128),
      name: z.string().trim().min(1).max(60),
    })
    .strict(),
  z
    .object({
      action: z.literal("register-response"),
      challengeId: z.uuid(),
      response: responseSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("verification-options"),
      binding: z
        .object({
          action: z.enum([
            "attendance-punch",
            "production-start",
            "cash-close",
          ]),
          requestId: z.uuid(),
          payload: z.json(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      action: z.literal("verification-response"),
      challengeId: z.uuid(),
      response: responseSchema,
    })
    .strict(),
  z
    .object({
      action: z.literal("revoke"),
      credentialId: z.string().min(1).max(2048),
    })
    .strict(),
]);
function configuration(request: Request) {
  const origin = request.headers.get("origin") ?? new URL(request.url).origin;
  if (!configuredOrigins().includes(origin))
    throw new AppError("FORBIDDEN", "El origen no está autorizado.", 403);
  const secret = process.env.BETTER_AUTH_SECRET ?? "";
  if (secret.length < 32)
    throw new AppError(
      "IDENTITY_CONFIG",
      "Administración debe completar la configuración de verificación.",
      503,
    );
  return { ...relyingParty(origin), secret };
}
export async function GET(request: Request) {
  try {
    const actor = await operationalActor(request),
      db = await getDb();
    if (!(await identitySchemaReady(db)))
      return privateJson({ ready: false, credentials: [] });
    const config = configuration(request);
    const targetId = z
      .string()
      .min(1)
      .max(100)
      .optional()
      .parse(new URL(request.url).searchParams.get("userId") ?? undefined);
    return privateJson({
      ready: true,
      credentials: await listCredentials(db, actor, config, targetId),
    });
  } catch (error) {
    return errorResponse(error);
  }
}
export async function POST(request: Request) {
  try {
    const input = schema.parse(await requestInput(request, 64000));
    const actor = await operationalActor(request),
      db = await getDb(),
      config = configuration(request);
    if (!(await identitySchemaReady(db)))
      throw new AppError(
        "IDENTITY_SETUP",
        "Administración debe completar la activación antes de configurar credenciales.",
        503,
      );
    if (input.action === "register-options")
      return privateJson(
        await beginRegistration(
          db,
          actor,
          { password: input.password, name: input.name },
          config,
        ),
      );
    if (input.action === "guided-register-options")
      return privateJson(await beginGuidedRegistration(db, actor, config));
    if (input.action === "register-response")
      return privateJson(
        await finishRegistration(
          db,
          actor,
          {
            challengeId: input.challengeId,
            response: input.response as RegistrationResponseJSON,
          },
          config,
        ),
      );
    if (input.action === "verification-options")
      return privateJson(
        await beginVerification(
          db,
          actor,
          { ...input.binding, branchId: actor.branchId! },
          config,
        ),
      );
    if (input.action === "verification-response")
      return privateJson(
        await finishVerification(
          db,
          actor,
          {
            challengeId: input.challengeId,
            response: input.response as AuthenticationResponseJSON,
          },
          config,
        ),
      );
    await revokeCredential(db, actor, input.credentialId);
    return privateJson({ revoked: true });
  } catch (error) {
    return errorResponse(error);
  }
}
