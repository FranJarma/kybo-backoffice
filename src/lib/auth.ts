import { drizzleAdapter } from "@better-auth/drizzle-adapter";
import { betterAuth } from "better-auth";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { z } from "zod";
import type { AppDb } from "../db/client";
import { getDb } from "../db/client";
import * as authSchema from "../db/auth-schema";
import { account, operationalUsers, user } from "../db/auth-schema";
import type { Actor } from "./access";
import { AppError } from "./errors";
import { trustedOrigins } from "./origins";

export function createAuth(
  db: AppDb,
  options: { secret: string; baseURL: string; trustedOrigins?: string[] },
) {
  if (options.secret.length < 32)
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg", schema: authSchema }),
    secret: options.secret,
    baseURL: options.baseURL,
    trustedOrigins: trustedOrigins(options.baseURL, options.trustedOrigins),
    emailAndPassword: {
      enabled: true,
      disableSignUp: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
    },
    advanced: { useSecureCookies: process.env.NODE_ENV === "production" },
    rateLimit: {
      enabled: true,
      storage: "database",
      modelName: "rateLimit",
      window: 60,
      max: 60,
      customRules: { "/sign-in/email": { window: 60, max: 5 } },
    },
  });
}

export type KyboAuth = ReturnType<typeof createAuth>;

export async function handleAuthRequest(
  request: Request,
  auth: KyboAuth,
  allowedOrigins: string[],
): Promise<Response> {
  if (request.method !== "GET") {
    const origin = request.headers.get("origin");
    if (!origin || !allowedOrigins.includes(origin)) {
      return Response.json(
        { error: "Origen no permitido.", code: "FORBIDDEN" },
        {
          status: 403,
          headers: { "Cache-Control": "private, no-store" },
        },
      );
    }
  }
  const response = await auth.handler(request);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

let authPromise: Promise<KyboAuth> | undefined;

export async function getAuth(): Promise<KyboAuth> {
  if (!authPromise)
    authPromise = (async () => {
      const secret = process.env.BETTER_AUTH_SECRET;
      const baseURL = process.env.BETTER_AUTH_URL;
      if (!secret || !baseURL)
        throw new Error("BETTER_AUTH_SECRET and BETTER_AUTH_URL are required.");
      const trustedOrigins = process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean);
      return createAuth(await getDb(), { secret, baseURL, trustedOrigins });
    })().catch((error: unknown) => {
      authPromise = undefined;
      throw error;
    });
  return authPromise;
}

export async function actorFromHeaders(
  requestHeaders: Headers,
  db: AppDb,
  auth: KyboAuth,
): Promise<Actor | null> {
  const session = await auth.api.getSession({ headers: requestHeaders });
  if (!session?.user?.id) return null;
  const [permissions] = await db
    .select({
      role: operationalUsers.role,
      disabled: operationalUsers.disabled,
    })
    .from(operationalUsers)
    .where(eq(operationalUsers.userId, session.user.id))
    .limit(1);
  return permissions && !permissions.disabled
    ? { id: session.user.id, role: permissions.role }
    : null;
}

export async function requireActor(): Promise<Actor> {
  const actor = await actorFromHeaders(
    await headers(),
    await getDb(),
    await getAuth(),
  );
  if (!actor)
    throw new AppError("UNAUTHORIZED", "Iniciá sesión para continuar.", 401);
  return actor;
}

/** Trusted server-only administrative action. Never expose through an HTTP endpoint. */
export async function provisionUser(
  db: AppDb,
  input: { name: string; email: string; password: string; role: Actor["role"] },
): Promise<string> {
  const name = input.name.trim();
  const email = input.email.trim().toLowerCase();
  if (
    !name ||
    !z.email().safeParse(email).success ||
    input.password.length < 8 ||
    input.password.length > 128 ||
    !(["admin", "manager", "staff"] as string[]).includes(input.role)
  ) {
    throw new AppError(
      "INVALID_INPUT",
      "Nombre, correo, contraseña o rol inválidos.",
      400,
    );
  }
  const passwordHash = await hashPassword(input.password);
  const id = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(user).values({ id, name, email, emailVerified: true });
    await tx.insert(account).values({
      id: crypto.randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: passwordHash,
    });
    await tx.insert(operationalUsers).values({ userId: id, role: input.role });
  });
  return id;
}
